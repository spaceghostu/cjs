/**
 * THE EDITOR'S STATE, AND THE PROMISE IT KEEPS.
 *
 *   "All changes saved · 21:47. You can close this and come back."
 *
 * That sentence is on the screen, so it is a specification. Four things follow, and each one
 * is a decision below rather than an accident of how the component happened to be written:
 *
 *  1. THE INDICATOR NEVER GUESSES. `savedAt` is only ever assigned from what the SERVER
 *     returned. An optimistic timestamp would show "saved" for a save that failed, which is
 *     precisely the thing the sentence promises cannot happen.
 *
 *  2. A CLOSED TAB LOSES NOTHING. Typing schedules a save; closing the tab flushes it
 *     immediately with `sendBeacon`, which the browser delivers after the page is gone.
 *     Debounce alone would drop the last thing somebody typed.
 *
 *  3. SAVES DO NOT OVERTAKE EACH OTHER. One in flight at a time, and anything typed while it
 *     is in flight is saved after it lands. Two concurrent saves can arrive in either order,
 *     and the loser silently wins.
 *
 *  4. A FAILURE IS SAID OUT LOUD. `status` has an `error` state, and the editor shows it. A
 *     save indicator that quietly stops updating is worse than no indicator at all.
 *
 * Deliberately a plain class in a `.svelte.ts` file rather than logic inside the component:
 * every rule above is testable without mounting anything.
 */
import type { DraftPatch, SaveResult } from '$lib/core/quoting/wire';

export type SaveStatus = 'saved' | 'saving' | 'pending' | 'error';

/** How long after the last keystroke a save is sent. */
export const AUTOSAVE_DELAY_MS = 900;

export type AutosaveOptions = {
	/** Where to POST. `/quoting/<id>/save`. */
	readonly endpoint: string;
	/** What the server last told us, in epoch milliseconds. */
	readonly savedAtMs: number;
	/** Overridable for tests. */
	readonly delayMs?: number;
};

export class Autosave {
	status = $state<SaveStatus>('saved');

	/**
	 * The saved moment, in epoch milliseconds.
	 *
	 * A number rather than a `Date`, and not only to satisfy `prefer-svelte-reactivity`: a
	 * `Date` in reactive state invites somebody to `setHours` on it and wonder why nothing
	 * re-rendered. There is nothing to mutate here — the value is replaced wholesale every time
	 * the server answers — so the primitive is the honest representation, and `savedAt` hands
	 * out a fresh `Date` to anything that wants to format one.
	 */
	savedAtMs = $state<number>(0);
	/** The message from a failed save, in language a person can act on. */
	error = $state<string | null>(null);

	#endpoint: string;
	#delayMs: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#inFlight = false;
	/** The most recent payload. Replaced rather than queued — the last one is the truth. */
	#latest: DraftPatch | null = null;

	constructor(options: AutosaveOptions) {
		this.#endpoint = options.endpoint;
		this.#delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;
		this.savedAtMs = options.savedAtMs;
	}

	/** Something changed. Schedules a save, replacing any that has not gone yet. */
	change(patch: DraftPatch): void {
		this.#latest = patch;
		this.status = 'pending';
		this.error = null;

		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), this.#delayMs);
	}

	/**
	 * Save now, and wait for it.
	 *
	 * Called by the timer, and by anything that must not proceed on unsaved work — sending, in
	 * particular. Sending a quote that still has an unsaved line would email the client a
	 * document the business never finished.
	 */
	async flush(): Promise<void> {
		if (this.#timer !== null) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}

		if (this.#latest === null) return;
		if (this.#inFlight) {
			// Something is already going. It will pick up `#latest` when it lands, because the
			// tail of `flush` re-checks. Nothing is dropped and nothing overtakes.
			return;
		}

		const payload = this.#latest;
		this.#latest = null;
		this.#inFlight = true;
		this.status = 'saving';

		try {
			const response = await fetch(this.#endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'We could not save your changes just now.');
			}

			const result = (await response.json()) as SaveResult;
			// `Date.parse`, not `new Date(...).getTime()`. There is no `Date` object anywhere
			// in this file: reactive state holds a number, and the one place a clock is
			// rendered takes one. See `clockTime`.
			this.savedAtMs = Date.parse(result.savedAt);
			this.status = this.#latest === null ? 'saved' : 'pending';
			this.error = null;
		} catch (cause) {
			// Put the payload back, so the next attempt — a keystroke, a retry, closing the tab —
			// still carries the work. Losing it here is the one outcome the promise forbids.
			this.#latest ??= payload;
			this.status = 'error';
			this.error =
				cause instanceof Error
					? cause.message
					: 'We could not save your changes just now. Your work is still on this screen.';
		} finally {
			this.#inFlight = false;
		}

		// Anything typed while that was in flight goes now.
		if (this.#latest !== null && this.status !== 'error') await this.flush();
	}

	/**
	 * THE CLOSED TAB.
	 *
	 * `sendBeacon` queues the request with the browser and returns immediately; the browser
	 * delivers it after the page is gone. A `fetch` here is cancelled with the document, which
	 * is exactly the case this exists to cover.
	 *
	 * Fired from `pagehide` and from `visibilitychange` to hidden — the only two events iOS
	 * Safari reliably delivers before a tab is discarded. `beforeunload` is not one of them.
	 */
	beacon(): void {
		if (this.#latest === null) return;
		if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
			void this.flush();
			return;
		}

		const blob = new Blob([JSON.stringify(this.#latest)], { type: 'application/json' });
		if (navigator.sendBeacon(this.#endpoint, blob)) this.#latest = null;
	}

	/** True when there is work the server has not acknowledged. */
	get dirty(): boolean {
		return this.#latest !== null || this.#inFlight;
	}

	destroy(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}
}

/**
 * "21:47" — the time the save indicator shows. 24-hour, because the design's is.
 *
 * Takes epoch milliseconds rather than a `Date`, so nothing upstream has to hold one. The
 * local clock is right here: the person reading it is the person who pressed the key.
 */
export function clockTime(atMs: number): string {
	// A transient read of the clock, not reactive state — nothing holds this object and nothing
	// mutates it, which is the case `prefer-svelte-reactivity` exists to catch.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient, see above
	const at = new Date(atMs);
	return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}
