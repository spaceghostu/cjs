/**
 * THE COUNT SHEET'S AUTOSAVE, AND THE PROMISE IT KEEPS.
 *
 *   "Saved automatically — leave and come back whenever."
 *
 * That sentence is printed in the sticky footer, so it is a specification, and T24's acceptance
 * criterion states it as a test: "the count survives closing the tab at any step, on any device".
 * Four decisions follow, each of them here rather than inside a component so that every one can
 * be exercised without mounting anything.
 *
 *  1. IT IS THE SERVER THAT SAYS "SAVED". `savedAtMs` is only ever assigned from what came back.
 *     An optimistic timestamp would show "saved" for a save that failed, which is exactly the
 *     thing the footer promises cannot happen.
 *
 *  2. A CLOSED TAB LOSES NOTHING. Typing schedules a save; closing the tab flushes it with
 *     `sendBeacon`, which the browser delivers after the page is gone. Debounce alone drops the
 *     last row somebody typed — which, on a count sheet, is the row they were standing in front
 *     of.
 *
 *     AND "NOTHING" INCLUDES THE BATCH ALREADY ON THE WIRE. This is the case the first version
 *     of this file got wrong, and it is worth writing down because it is invisible from the
 *     outside: a batch that has been drained out of `#pending` and handed to `fetch` lives
 *     nowhere the beacon can see it, so a tab closed one second after a keystroke found an empty
 *     queue, sent nothing, and let the browser cancel the `fetch` on its way out — while the
 *     header said "saving…". So the in-flight batch is HELD, in `#inFlightPayload`, for exactly
 *     as long as the request is open, and the beacon carries it too. Delivering it twice costs
 *     nothing: `saveCountLine` writes a quantity, not an increment, so the last write per line
 *     wins and both writes say the same thing.
 *
 *     THE MERGE ORDER IS THE WHOLE OF IT. In-flight first, then `#pending` over the top. A line
 *     typed again while its earlier value was on the wire is NEWER, and a beacon that let the
 *     older one win would save the number somebody had already corrected.
 *
 *  3. NOTHING IS STORED IN THE BROWSER. Not `localStorage`, not IndexedDB. "On any device" is
 *     the acceptance criterion, and a count that lives in one browser's storage is a count that
 *     vanishes when somebody picks up the laptop instead of the tablet. Every keystroke goes to
 *     `saveCountLine`, which is the only place a counted quantity exists.
 *
 *  4. IT BATCHES BY LINE, WHICH IS WHERE THIS DIFFERS FROM QUOTING'S.
 *     `quoting/state.svelte.ts` keeps ONE payload and replaces it — correct there, because a
 *     quote autosave sends the whole document and the last one is the truth. Counting is typing
 *     down a column: five rows change during one debounce, and "the last one wins" would save the
 *     fifth and silently drop four. So the pending edits are a MAP keyed by line, drained whole
 *     into a single request. One request rather than five also means one `sendBeacon` on the way
 *     out — a browser will deliver one reliably and five racing ones in whatever order it likes.
 *
 * WHAT IS NOT QUEUED: a value the parser could not read. `checkCounted` is asked in the page
 * before anything reaches here, and an unreadable box shows a message and enqueues nothing — so
 * the last quantity the server acknowledged still stands, in the database and in the footer's
 * running total, rather than being replaced by half a keystroke.
 */
import type { CountLinePatch, CountPatch, CountSaveResult } from '$lib/core/inventory';

export type CountSaveStatus = 'saved' | 'saving' | 'pending' | 'error';

/**
 * How long after the last keystroke a save is sent.
 *
 * Longer than the quote editor's 900ms, on purpose. Counting is a rhythm — read the shelf, type,
 * tab, read the next shelf — and a save fired between two rows of the same rhythm is a request
 * per row. Somebody pausing for a second and a half has genuinely stopped to look at something.
 */
export const COUNT_AUTOSAVE_DELAY_MS = 1_500;

export type CountAutosaveOptions = {
	/**
	 * Where to POST — asked at send time, not captured at construction.
	 *
	 * A function rather than a string because SvelteKit reuses a component across a navigation
	 * between two counts on the same route, and an endpoint frozen at construction would send the
	 * second count's rows to the first count's URL. The server would refuse them (a line id that
	 * belongs to another sheet is skipped), so this is not a correctness hole so much as a save
	 * that silently never happens — which is the one outcome the footer's promise forbids.
	 */
	readonly endpoint: () => string;
	/** Overridable for tests. */
	readonly delayMs?: number;
};

export class CountAutosave {
	status = $state<CountSaveStatus>('saved');
	/**
	 * The saved moment, in epoch milliseconds; 0 before the first save of this visit.
	 *
	 * A number rather than a `Date`, for the reason `quoting/state.svelte.ts` gives at length: a
	 * `Date` in reactive state invites somebody to mutate it and wonder why nothing re-rendered.
	 */
	savedAtMs = $state<number>(0);
	/** The message from a failed save, in language a person can act on. */
	error = $state<string | null>(null);

	#endpoint: () => string;
	#delayMs: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#inFlight = false;
	/**
	 * Line id -> what to store for it. A plain `Map`, deliberately NOT `SvelteMap`: nothing reads
	 * this in a template, and reactivity would make every keystroke re-render a 48-row table. The
	 * things a screen watches are `status`, `savedAtMs` and `error`, and those are runes.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not reactive state; see above
	#pending = new Map<string, string | null>();
	/**
	 * The batch currently on the wire, or null when nothing is.
	 *
	 * Held for one reason only: a closing tab has to be able to find it. `#take()` empties
	 * `#pending` the instant a request starts, so between that moment and the response the work
	 * exists nowhere else — see decision 2 in the header. Set beside `#inFlight` and cleared
	 * beside it in the same `finally`, so the two can never disagree about whether there is a
	 * request open, and so a batch the server has already acknowledged cannot be resurrected by
	 * a beacon fired minutes later.
	 */
	#inFlightPayload: CountPatch | null = null;

	constructor(options: CountAutosaveOptions) {
		this.#endpoint = options.endpoint;
		this.#delayMs = options.delayMs ?? COUNT_AUTOSAVE_DELAY_MS;
	}

	/**
	 * One line changed. Schedules a save, replacing any that has not gone yet.
	 *
	 * `counted` is the TEXT, trimmed by the caller, or null to un-count the line. Nothing here
	 * parses it — there is one parser in this product and it lives on the other side of the wire.
	 */
	change(lineId: string, counted: string | null): void {
		this.#pending.set(lineId, counted);
		this.status = 'pending';
		this.error = null;

		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), this.#delayMs);
	}

	/**
	 * Save now, and wait for it.
	 *
	 * Called by the timer, and by anything that must not proceed on unsaved work — moving to the
	 * review step, in particular. Reviewing a count with an unsaved row would show somebody a
	 * figure to approve that is not the figure that would be applied, which is the one disagreement
	 * T24 makes an acceptance criterion.
	 */
	async flush(): Promise<void> {
		if (this.#timer !== null) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}

		if (this.#pending.size === 0) return;
		if (this.#inFlight) {
			// Something is already going. The tail of this function re-checks when it lands, so
			// nothing is dropped and nothing overtakes.
			return;
		}

		const payload = this.#take();
		this.#inFlight = true;
		this.#inFlightPayload = payload;
		this.status = 'saving';

		try {
			const response = await fetch(this.#endpoint(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'We could not save your count just now.');
			}

			const result = (await response.json()) as CountSaveResult;

			// A 2xx IS NOT THE SAME CLAIM AS "ALL OF IT".
			//
			// The endpoint counts what it wrote and says so, because it deliberately SKIPS a line
			// whose id belongs to a different count — that filter is what stops one sheet writing
			// to another sheet's rows. If it ever fires, the batch went in partially, and an
			// indicator that answered that with "saved" would be making exactly the claim
			// decision 1 exists to forbid. So it is treated as a failed save: the rows go back on
			// the queue below, and the person is told, rather than being shown a timestamp for
			// work that is not in the database.
			if (result.saved !== payload.lines.length) {
				throw new Error('Some of those rows did not save. Your work is still on this screen.');
			}

			this.savedAtMs = Date.parse(result.savedAt);
			this.status = this.#pending.size === 0 ? 'saved' : 'pending';
			this.error = null;
		} catch (cause) {
			// Put the work back, so the next attempt — a keystroke, a retry, closing the tab —
			// still carries it. Anything typed since is NEWER and wins, which is why this restores
			// only the lines nobody has touched again.
			for (const line of payload.lines) {
				if (!this.#pending.has(line.id)) this.#pending.set(line.id, line.counted);
			}
			this.status = 'error';
			this.error =
				cause instanceof Error
					? cause.message
					: 'We could not save your count just now. Your work is still on this screen.';
		} finally {
			this.#inFlight = false;
			// Together with `#inFlight`, always. A payload left behind here is a batch the server
			// has already written, and a later beacon would send it again over whatever has been
			// typed since.
			this.#inFlightPayload = null;
		}

		// Anything typed while that was in flight goes now.
		if (this.#pending.size > 0 && this.status !== 'error') await this.flush();
	}

	/**
	 * THE CLOSED TAB.
	 *
	 * `sendBeacon` queues the request with the browser and returns immediately; the browser
	 * delivers it after the page is gone. A `fetch` here is cancelled with the document, which is
	 * exactly the case this exists to cover.
	 *
	 * Fired from `pagehide` and from `visibilitychange` to hidden — the only two events iOS Safari
	 * reliably delivers before a tab is discarded. `beforeunload` is not one of them.
	 *
	 * IT CARRIES THE IN-FLIGHT BATCH AS WELL AS THE QUEUED ONE, and decision 2 in the header is
	 * the argument. Asking `#pending` alone answers "is there anything to send" with "no" during
	 * the one-second window when the answer matters most — the request the browser is about to
	 * cancel is holding the row somebody typed a moment ago.
	 */
	beacon(): void {
		if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
			void this.flush();
			return;
		}

		const payload = this.#leaving();
		if (payload.lines.length === 0) return;

		const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
		if (navigator.sendBeacon(this.#endpoint(), blob)) {
			// Queued with the browser, which is as close to "sent" as this ever gets. Drop what
			// the beacon actually carried, by id rather than by clearing — the in-flight lines
			// were never in `#pending` to begin with, and the queue must not lose a line the
			// payload does not name.
			for (const line of payload.lines) this.#pending.delete(line.id);
			return;
		}

		// The browser refused to queue it — over its beacon budget, most likely. Nothing is
		// removed, so a later flush still carries the work rather than this pretending.
	}

	/** True when there is work the server has not acknowledged. */
	get dirty(): boolean {
		return this.#pending.size > 0 || this.#inFlight;
	}

	destroy(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}

	/** Drain the pending edits into one payload. */
	#take(): CountPatch {
		const lines: CountLinePatch[] = [...this.#pending].map(([id, counted]) => ({ id, counted }));
		this.#pending.clear();
		return { lines };
	}

	/**
	 * EVERYTHING THE SERVER HAS NOT ACKNOWLEDGED, as one payload, without draining anything.
	 *
	 * The in-flight batch goes in first and `#pending` goes over the top, so a line typed again
	 * while its earlier value was on the wire wins — it is the newer fact, and it is the one the
	 * person can see on the screen they are closing. Nothing is removed here because nothing has
	 * been delivered yet: `beacon()` drops what it carried only once the browser has taken it.
	 */
	#leaving(): CountPatch {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a throwaway, read by nothing
		const merged = new Map<string, string | null>();
		for (const line of this.#inFlightPayload?.lines ?? []) merged.set(line.id, line.counted);
		for (const [id, counted] of this.#pending) merged.set(id, counted);

		const lines: CountLinePatch[] = [...merged].map(([id, counted]) => ({ id, counted }));
		return { lines };
	}
}
