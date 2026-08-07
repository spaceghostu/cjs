/**
 * BOUNDED PARALLEL LOADING.
 *
 * The Home dashboard streams one short transaction per owned module. `db/client.ts` states
 * the relationship the pool has to satisfy:
 *
 *   max >= (modules a business can own) x (expected concurrent dashboard loads) + headroom
 *
 * A plain `Promise.all` over the owned modules honours the left-hand side and ignores the
 * right. Seven modules times four people opening the dashboard at once is twenty-eight
 * connections wanted from a pool of ten — and the failure is not a slow page, it is
 * `timeout exceeded when trying to connect` for every OTHER request in the process,
 * including the ones that have nothing to do with the dashboard. One page starves the app.
 *
 * So the fan-out is bounded, and work over the bound QUEUES. A dashboard that takes an extra
 * beat to fill in is invisible; a dashboard that takes the sign-in page down with it is not.
 */
import { env } from '$lib/server/env';

/**
 * How much of the pool a single fan-out may hold.
 *
 * A third, floor 1. That leaves room for three dashboards to be mid-flight simultaneously
 * before the pool is fully committed, plus the connections the request's own queries and
 * every other request need. Raising this trades other requests' latency for this one's, and
 * the dashboard is not the page to optimise at that cost.
 */
export function fanoutBound(poolMax: number = env.DATABASE_POOL_MAX): number {
	// Connections, not money: there is no rounding policy to respect, because a third of a
	// connection cannot be opened.
	// eslint-disable-next-line no-restricted-syntax -- not money, see above
	return Math.max(1, Math.trunc(poolMax / 3));
}

export type FanoutOptions = {
	/** Overridable for tests and for callers that know their own cost. */
	bound?: number;
};

/**
 * Run `task` over every item, at most `bound` at a time, preserving input order.
 *
 * Every task is run even if an earlier one rejects, and the first failure is re-thrown once
 * they have all settled. That is deliberate: bailing out early would leave in-flight
 * transactions to return their connections at an unpredictable moment, turning one failure
 * into the pool exhaustion this module exists to prevent. The wasted work is bounded by
 * `bound` and is worth the predictability.
 */
export async function fanout<T, R>(
	items: readonly T[],
	task: (item: T, index: number) => Promise<R>,
	options: FanoutOptions = {}
): Promise<R[]> {
	const settled = await fanoutSettled(items, task, options);

	const values: R[] = [];
	for (const result of settled) {
		if (result.status === 'failed') throw result.error;
		values.push(result.value);
	}
	return values;
}

export type FanoutResult<R> = { status: 'ok'; value: R } | { status: 'failed'; error: unknown };

/**
 * The same bound, without the all-or-nothing.
 *
 * What the dashboard actually wants: one module failing to load should leave a card saying
 * so, not blank the page. The design's whole premise is that modules are independent, and a
 * dashboard that dies because Inventory is unhappy contradicts it.
 */
export async function fanoutSettled<T, R>(
	items: readonly T[],
	task: (item: T, index: number) => Promise<R>,
	options: FanoutOptions = {}
): Promise<FanoutResult<R>[]> {
	// Concurrent workers, not money: a caller-supplied bound is normalised to a whole
	// number of connections.
	// eslint-disable-next-line no-restricted-syntax -- not money, see above
	const bound = Math.max(1, Math.trunc(options.bound ?? fanoutBound()));
	const results = new Array<FanoutResult<R>>(items.length);

	// A shared cursor rather than chunking. Chunks stall on their slowest member — with a
	// cursor, a worker that finishes early immediately picks up the next item, so the bound
	// is a genuine concurrency ceiling rather than an average.
	let cursor = 0;

	async function worker(): Promise<void> {
		for (;;) {
			const index = cursor;
			cursor += 1;
			if (index >= items.length) return;

			try {
				results[index] = { status: 'ok', value: await task(items[index], index) };
			} catch (error) {
				results[index] = { status: 'failed', error };
			}
		}
	}

	const workers = Array.from({ length: Math.min(bound, items.length) }, worker);
	await Promise.all(workers);

	return results;
}

/**
 * The same bound, one promise PER ITEM rather than one for the batch.
 *
 * `fanoutSettled` answers when everything has answered, which is the wrong shape for a
 * streamed page: Home sends each panel as it is ready, and a panel that reads two modules
 * must not wait on the five it does not read. A single batch promise would re-introduce
 * exactly the barrier the streaming exists to remove — the slowest module would set the
 * arrival time of every panel on the screen.
 *
 * So the queue is still shared and still bounded, and each item's result is handed back the
 * moment ITS task settles. Nothing here rejects: a task that throws resolves as `failed`,
 * because an unhandled rejection on a promise nobody has awaited yet takes the process down
 * rather than the panel.
 */
export function fanoutEach<T, R>(
	items: readonly T[],
	task: (item: T, index: number) => Promise<R>,
	options: FanoutOptions = {}
): readonly Promise<FanoutResult<R>>[] {
	const slots = items.map(() => defer<FanoutResult<R>>());

	// The batch promise is deliberately dropped: every outcome has already been delivered
	// through a slot, and `fanoutSettled` does not reject.
	void fanoutSettled(
		items,
		async (item, index) => {
			try {
				slots[index].settle({ status: 'ok', value: await task(item, index) });
			} catch (error) {
				slots[index].settle({ status: 'failed', error });
			}
		},
		options
	);

	return slots.map((slot) => slot.promise);
}

function defer<T>(): { promise: Promise<T>; settle: (value: T) => void } {
	let settle!: (value: T) => void;
	const promise = new Promise<T>((resolve) => {
		settle = resolve;
	});
	return { promise, settle };
}
