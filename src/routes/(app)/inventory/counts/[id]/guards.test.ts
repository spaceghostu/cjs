/**
 * "NOTHING COMMITS UNTIL YOU'VE REVIEWED IT AT STEP 3" — ENFORCED, NOT DISPLAYED.
 *
 * The stock count screen hides the "Update stock" button until step 3, and a hidden button is
 * not a guarantee. It is a courtesy to somebody using a mouse. The guarantee is that a request
 * arriving out of order — a resubmitted form, a second tab, a `curl` — is REFUSED by the server,
 * and that is what this file proves, by calling the actions and the endpoint the way a browser
 * does rather than by clicking anything.
 *
 * WHY IT MATTERS MORE HERE THAN ANYWHERE ELSE. T24 calls this flow the pattern-setter, and names
 * what copies it: pay runs, VAT returns, bank reconciliation. Every one of those is a screen
 * where the last step spends somebody's money. A guard nothing exercises is a guard the next
 * implementer can delete during a tidy-up with a green suite, and the fourth flow inherits the
 * hole.
 *
 * THE FOUR REFUSALS, AND WHAT EACH ONE IS FOR
 * -------------------------------------------
 *   apply at step 2      the whole promise. Applying without reviewing writes a movement per
 *                        variance for figures nobody has been shown.
 *   apply twice          every variance posted a second time, doubled.
 *   save while reviewing the figures on the review step have to be the figures being approved.
 *   save after applied   the sheet is evidence now, not a working document.
 *
 * The fifth is not about steps at all: a line id belonging to a DIFFERENT count must not be
 * written, or one sheet can edit another sheet's rows by way of an edited request.
 *
 * These are route tests, which this codebase has none of yet, so the shape is worth stating.
 * `localsFor` builds the tenancy, attribution and entitlement a real request arrives with;
 * `eventFor` wraps them in a `RequestEvent`. The rest of this file adds the two fields a browser
 * also sends and the fixture does not need in general — the route parameter and the request body.
 * There is no mock anywhere: every assertion below is against a real Postgres.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { closePool, runScoped } from '$lib/server/core/db/client';
import {
	cleanupFixtures,
	createBusiness,
	createUser,
	eventFor,
	localsFor
} from '$lib/server/core/db/fixtures';
import { NO_ACCESS, type AccessMap } from '$lib/server/core/ctx';
import { stockCountLine } from '$lib/server/core/db/schema/inventory';
import { createItem } from '$lib/server/modules/inventory/effects';
import { beginReview, prepareCount } from '$lib/server/modules/inventory/counts';
import { loadStockCount, loadStockCountLines } from '$lib/server/modules/inventory/queries';
import { actions } from './+page.server';
import { POST } from './save/+server';
import type { RequestEvent as PageEvent } from './$types';
import type { RequestEvent as SaveEvent } from './save/$types';

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

/** Inventory owned and writable, which is the state every test here starts from. */
const OWNED: AccessMap = { ...NO_ACCESS, inventory: 'write' };

/**
 * A business with one item, one prepared count, and the locals a signed-in owner arrives with.
 *
 * One item is enough: these are tests about a STATUS, and forty-eight lines would only make the
 * failures slower to read. The arithmetic has its own file.
 */
async function counting() {
	const owner = await createUser();
	const business = await createBusiness(owner.id, 'Thornhill Joinery');
	const t = { businessId: business.id, userId: owner.id };

	await runScoped(t.businessId, t.userId, (tx) =>
		createItem(
			tx,
			t.businessId,
			t.userId,
			{
				name: 'Danish oil, 5L',
				sku: null,
				description: null,
				unit: 'each',
				costMicros: 420_000_000,
				sellMicros: null,
				reorderPointE6: 2_000_000,
				defaultLocationId: null,
				newLocationName: 'Rack A'
			},
			{ qtyE6: 12_000_000, locationId: null }
		)
	);

	const countId = await runScoped(t.businessId, t.userId, (tx) =>
		prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
	);

	return { ...t, countId, locals: await localsFor(owner, business, OWNED) };
}

type Counting = Awaited<ReturnType<typeof counting>>;

/**
 * The request, with the two things a route reads that the shared fixture does not carry.
 *
 * `params` because the count id is in the path, and `request` because the save endpoint reads a
 * JSON body. Built here rather than in `db/fixtures.ts` so the shared helper stays the small
 * thing every other test already depends on.
 */
function requestFor(c: Counting, countId: string, body: unknown): PageEvent & SaveEvent {
	const url = `http://localhost:5173/inventory/counts/${countId}`;
	return {
		...eventFor(c.locals, `/inventory/counts/${countId}`),
		params: { id: countId },
		request: new Request(`${url}/save`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as unknown as PageEvent & SaveEvent;
}

/** What the count's status column says right now, read the way the page reads it. */
async function statusOf(c: Counting): Promise<string> {
	return runScoped(c.businessId, c.userId, async (tx) => {
		const header = await loadStockCount(tx, c.countId);
		return header?.status ?? 'no such count';
	});
}

/** The one line on the sheet. */
async function onlyLine(c: Counting, countId = c.countId) {
	return runScoped(c.businessId, c.userId, async (tx) => {
		const [line] = await loadStockCountLines(tx, countId);
		return line;
	});
}

/** Movements written by this count, which is the thing "nothing commits" is a claim about. */
async function movementsFrom(c: Counting): Promise<number> {
	return runScoped(c.businessId, c.userId, async (tx) => {
		const rows = await tx
			.select({ movementId: stockCountLine.movementId })
			.from(stockCountLine)
			.where(eq(stockCountLine.stockCountId, c.countId));
		return rows.filter((r) => r.movementId !== null).length;
	});
}

/**
 * A refusal, unwrapped.
 *
 * The actions answer one with `fail(422, { message })` rather than a thrown error, deliberately:
 * a 500 loses somebody's place on a screen they have been working on for twenty minutes. So a
 * refused action RETURNS, and this is what it returns.
 */
function refusal(result: unknown): { status: number; message: string } {
	const failure = result as { status?: number; data?: { message?: string } };
	return { status: failure.status ?? 0, message: failure.data?.message ?? '' };
}

/**
 * A successful action redirects back to the same screen, which SvelteKit signals by throwing.
 *
 * `run` returns `unknown` rather than a promise because an action's declared return type is
 * `MaybePromise`. Awaiting a value that is not one is free, and narrowing the parameter would
 * make every call site cast.
 */
async function redirected(run: () => unknown): Promise<number> {
	try {
		await run();
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown.status;
		throw thrown;
	}
	throw new Error('expected a redirect, but the action returned');
}

/** An `error()` from the endpoint, likewise thrown. */
async function refusedWith(run: () => unknown): Promise<{ status: number; body: string }> {
	try {
		await run();
	} catch (thrown) {
		if (isHttpError(thrown)) {
			return { status: thrown.status, body: JSON.stringify(thrown.body) };
		}
		throw thrown;
	}
	throw new Error('expected the request to be refused, but it succeeded');
}

describe('the step-3 gate, from the server side', () => {
	/**
	 * THE ONE THAT MATTERS. A count sitting at step 2 has had no review step rendered for it, so
	 * nobody has seen what would change — and `applyCount` on its own would happily do it, because
	 * the database permits `counting -> applied`. The gate is the application's, so it has to be
	 * the application that is tested for it.
	 */
	it('refuses to apply a count that has not been reviewed', async () => {
		const c = await counting();
		expect(await statusOf(c)).toBe('counting');

		const result = refusal(await actions.apply(requestFor(c, c.countId, {})));

		expect(result.status).toBe(422);
		expect(result.message).toMatch(/that is step 3/i);
		// Refused, and nothing on its way to being refused.
		expect(await statusOf(c)).toBe('counting');
		expect(await movementsFrom(c)).toBe(0);
	}, 60_000);

	it('applies once the count has been through review, and refuses a second time', async () => {
		const c = await counting();

		// Twelve expected, nine on the shelf. A variance, so the apply has something to post —
		// an all-matching count applies cleanly and moves nothing, which would make the
		// movement assertions below pass for the wrong reason.
		const line = await onlyLine(c);
		await POST(requestFor(c, c.countId, { lines: [{ id: line.id, counted: '9' }] }));

		expect(await redirected(() => actions.review(requestFor(c, c.countId, {})))).toBe(303);
		expect(await statusOf(c)).toBe('reviewing');

		expect(await redirected(() => actions.apply(requestFor(c, c.countId, {})))).toBe(303);
		expect(await statusOf(c)).toBe('applied');
		expect(await movementsFrom(c)).toBe(1);

		// A second submit — a back button, a double tap — must not post the variance twice.
		const again = refusal(await actions.apply(requestFor(c, c.countId, {})));
		expect(again.status).toBe(422);
		expect(again.message).toMatch(/already been applied/i);
		expect(await movementsFrom(c)).toBe(1);
	}, 60_000);

	/** Step 3 back to step 2. The last point of return has to actually return. */
	it('reopens a count for another look', async () => {
		const c = await counting();

		await redirected(() => actions.review(requestFor(c, c.countId, {})));
		expect(await redirected(() => actions.back(requestFor(c, c.countId, {})))).toBe(303);
		expect(await statusOf(c)).toBe('counting');
	}, 60_000);
});

describe('the save endpoint writes only while a count is being counted', () => {
	it('stores a counted quantity at step 2', async () => {
		const c = await counting();
		const line = await onlyLine(c);

		const response = await POST(
			requestFor(c, c.countId, { lines: [{ id: line.id, counted: '9' }] })
		);
		const body = (await response.json()) as { saved: number; savedAt: string };

		expect(response.status).toBe(200);
		expect(body.saved).toBe(1);
		expect((await onlyLine(c)).counted?.e6).toBe(9_000_000);
	}, 60_000);

	/**
	 * A count at step 3 has stopped being editable, and that is what makes step 3 a gate rather
	 * than a summary: a row saved underneath the review would change the figure somebody is in
	 * the middle of approving.
	 */
	it('refuses a save while the count is being reviewed', async () => {
		const c = await counting();
		const line = await onlyLine(c);
		await runScoped(c.businessId, c.userId, (tx) => beginReview(tx, c.countId));

		const refused = await refusedWith(() =>
			POST(requestFor(c, c.countId, { lines: [{ id: line.id, counted: '9' }] }))
		);

		expect(refused.status).toBe(409);
		expect(refused.body).toMatch(/being reviewed/i);
		expect((await onlyLine(c)).counted).toBeNull();
	}, 60_000);

	/** And an applied count is evidence. Its lines are what the ledger was written from. */
	it('refuses a save once the count has been applied', async () => {
		const c = await counting();
		const line = await onlyLine(c);

		await redirected(() => actions.review(requestFor(c, c.countId, {})));
		await redirected(() => actions.apply(requestFor(c, c.countId, {})));

		const refused = await refusedWith(() =>
			POST(requestFor(c, c.countId, { lines: [{ id: line.id, counted: '9' }] }))
		);

		expect(refused.status).toBe(409);
		expect(refused.body).toMatch(/already been applied/i);
	}, 60_000);

	/**
	 * ONE SHEET CANNOT WRITE TO ANOTHER SHEET'S ROWS.
	 *
	 * RLS already keeps another business's lines out of reach — that is proven in `tenancy.test.ts`
	 * and is not what this is about. This is the line id belonging to a different count IN THE SAME
	 * BUSINESS, which RLS has no opinion about at all, and which an edited request could otherwise
	 * use to write a quantity onto a sheet nobody is looking at.
	 *
	 * It is also why the endpoint answers with `saved` rather than just a 200: the skipped lines
	 * are silent, and the browser has to be able to tell that the batch went in short.
	 */
	it('ignores a line id that belongs to a different count', async () => {
		const c = await counting();
		const other = await runScoped(c.businessId, c.userId, (tx) =>
			prepareCount(tx, c.businessId, c.userId, { start: '2026-06-01', end: '2026-06-30' })
		);
		const theirs = await onlyLine(c, other);

		const response = await POST(
			requestFor(c, c.countId, { lines: [{ id: theirs.id, counted: '9' }] })
		);
		const body = (await response.json()) as { saved: number };

		// Accepted as a request, and it wrote nothing.
		expect(response.status).toBe(200);
		expect(body.saved).toBe(0);
		expect((await onlyLine(c, other)).counted).toBeNull();
	}, 60_000);

	/** A body the parser cannot read is refused before any transaction opens. */
	it('refuses a malformed patch with a sentence, not a 500', async () => {
		const c = await counting();

		const refused = await refusedWith(() =>
			POST(requestFor(c, c.countId, { lines: [{ id: 'not-a-uuid', counted: '9' }] }))
		);

		expect(refused.status).toBe(422);
	}, 60_000);
});
