/**
 * "SAVED AUTOMATICALLY — LEAVE AND COME BACK WHENEVER." UNDER TEST.
 *
 * The sticky footer prints that sentence, so it is a specification, and T24 turns it into an
 * acceptance criterion: "the count survives closing the tab at any step, on any device". The
 * hard part is not the fetch — it is the ORDERING, and ordering is testable without a browser,
 * which is why `CountAutosave` is a class in a `.svelte.ts` file rather than logic inside a
 * component.
 *
 * The claim that distinguishes this from the quote editor's autosave has a block of its own:
 * counting is typing down a COLUMN, so several lines change during one debounce and every one
 * of them has to arrive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountAutosave } from './count.svelte.js';
import type { CountPatch } from '$lib/core/inventory';

let bodies: string[];
/**
 * The stubbed endpoint, handed the body it was sent.
 *
 * It takes the body because the real endpoint answers with `saved`, a COUNT of the rows it
 * actually wrote, and the class now checks that number against what it sent — a batch the server
 * only partly stored is not a save. A stub that always answered `saved: 1` would quietly send
 * every multi-line test down the failure path and prove nothing about either.
 */
let respond: (body: string) => Promise<Response>;

/** Wrote everything it was given, at a fixed instant. The ordinary case. */
const wroteAll = async (body: string) =>
	new Response(
		JSON.stringify({
			savedAt: '2026-08-04T19:47:00.000Z',
			saved: (JSON.parse(body) as CountPatch).lines.length
		}),
		{ status: 200 }
	);

beforeEach(() => {
	vi.useFakeTimers();
	bodies = [];
	respond = wroteAll;

	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const body = String(init.body);
			bodies.push(body);
			return respond(body);
		})
	);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function autosave(delayMs = 100) {
	return new CountAutosave({ endpoint: () => '/inventory/counts/c1/save', delayMs });
}

const sent = (body: string) => JSON.parse(body) as CountPatch;

describe('a column of rows is one save, not one save per row', () => {
	/**
	 * The bug this exists to prevent: "the last payload wins" is right for a quote, which sends
	 * the whole document, and catastrophic for a count sheet, which sends the row that changed.
	 */
	it('sends every line that changed during one debounce', async () => {
		const save = autosave();
		save.change('line-a', '14');
		save.change('line-b', '12');
		save.change('line-c', '2');

		await vi.advanceTimersByTimeAsync(100);

		expect(bodies).toHaveLength(1);
		expect(sent(bodies[0]).lines).toEqual([
			{ id: 'line-a', counted: '14' },
			{ id: 'line-b', counted: '12' },
			{ id: 'line-c', counted: '2' }
		]);
	});

	/** Retyping a row before the save goes replaces it. Nobody wants both numbers stored. */
	it('keeps only the latest value for a line typed twice', async () => {
		const save = autosave();
		save.change('line-a', '14');
		save.change('line-a', '145');

		await vi.advanceTimersByTimeAsync(100);

		expect(sent(bodies[0]).lines).toEqual([{ id: 'line-a', counted: '145' }]);
	});

	/** A blank box crosses as null. It is "I have not looked at this one yet", not a zero. */
	it('sends an emptied row as null, not as a zero', async () => {
		const save = autosave();
		save.change('line-a', null);

		await vi.advanceTimersByTimeAsync(100);

		expect(sent(bodies[0]).lines).toEqual([{ id: 'line-a', counted: null }]);
	});

	/** And a typed zero crosses as a zero, which is a variance against anything but zero. */
	it('sends a typed zero as a zero', async () => {
		const save = autosave();
		save.change('line-a', '0');

		await vi.advanceTimersByTimeAsync(100);

		expect(sent(bodies[0]).lines).toEqual([{ id: 'line-a', counted: '0' }]);
	});
});

describe('the indicator never guesses', () => {
	it('shows the moment the SERVER wrote', async () => {
		const save = autosave();
		save.change('line-a', '14');

		expect(save.status).toBe('pending');
		await vi.advanceTimersByTimeAsync(100);

		expect(save.status).toBe('saved');
		expect(save.savedAtMs).toBe(Date.parse('2026-08-04T19:47:00.000Z'));
		expect(save.dirty).toBe(false);
	});

	it('says so out loud when a save fails, and keeps the work', async () => {
		const save = autosave();
		respond = async () =>
			new Response(JSON.stringify({ message: 'That count has already been applied.' }), {
				status: 409
			});

		save.change('line-a', '14');
		await vi.advanceTimersByTimeAsync(100);

		expect(save.status).toBe('error');
		expect(save.error).toBe('That count has already been applied.');
		// The work is still queued. A save indicator that quietly stops updating, having thrown
		// away what somebody typed, is worse than no indicator at all.
		expect(save.dirty).toBe(true);
	});

	/** A row typed while a failed save was in flight is NEWER, and must not be overwritten. */
	it('does not resurrect a stale value over a newer one', async () => {
		const save = autosave();
		respond = async () => new Response('{}', { status: 500 });

		save.change('line-a', '14');
		await vi.advanceTimersByTimeAsync(100);
		expect(save.status).toBe('error');

		respond = async () =>
			new Response(JSON.stringify({ savedAt: '2026-08-04T19:47:00.000Z', saved: 1 }), {
				status: 200
			});
		save.change('line-a', '145');
		await vi.advanceTimersByTimeAsync(100);

		expect(sent(bodies[bodies.length - 1]).lines).toEqual([{ id: 'line-a', counted: '145' }]);
		expect(save.status).toBe('saved');
	});
});

describe('saves do not overtake each other', () => {
	it('holds a second save until the first has landed, then sends what is waiting', async () => {
		const save = autosave();
		// A holder rather than a bare `let`: assigning inside a promise executor is invisible to
		// the compiler's narrowing, and `release?.()` on a `let` initialised to null is `never`.
		const gate: { release: (() => void) | null } = { release: null };
		respond = async () => {
			await new Promise<void>((resolve) => {
				gate.release = resolve;
			});
			return new Response(JSON.stringify({ savedAt: '2026-08-04T19:47:00.000Z', saved: 1 }), {
				status: 200
			});
		};

		save.change('line-a', '14');
		await vi.advanceTimersByTimeAsync(100);
		expect(bodies).toHaveLength(1);

		// Typed while the first request is still open.
		save.change('line-b', '12');
		await vi.advanceTimersByTimeAsync(100);
		expect(bodies).toHaveLength(1);

		respond = async () =>
			new Response(JSON.stringify({ savedAt: '2026-08-04T19:48:00.000Z', saved: 1 }), {
				status: 200
			});
		gate.release?.();
		await vi.advanceTimersByTimeAsync(0);

		expect(bodies).toHaveLength(2);
		expect(sent(bodies[1]).lines).toEqual([{ id: 'line-b', counted: '12' }]);
	});
});

describe('a closed tab loses nothing', () => {
	it('flushes through sendBeacon, which survives the page', () => {
		const sendBeacon = vi.fn(() => true);
		vi.stubGlobal('navigator', { sendBeacon });

		const save = autosave();
		save.change('line-a', '14');
		save.change('line-b', '12');
		save.beacon();

		expect(sendBeacon).toHaveBeenCalledOnce();
		// ONE beacon carrying both rows. A browser will deliver one reliably and five racing
		// ones in whatever order it likes.
		expect(save.dirty).toBe(false);
	});

	it('falls back to a fetch where sendBeacon is unavailable', async () => {
		vi.stubGlobal('navigator', {});

		const save = autosave();
		save.change('line-a', '14');
		save.beacon();
		await vi.advanceTimersByTimeAsync(0);

		expect(bodies).toHaveLength(1);
	});

	/** A browser over its beacon budget says no. The work goes back in the queue. */
	it('keeps the work when the browser refuses to queue the beacon', () => {
		vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => false) });

		const save = autosave();
		save.change('line-a', '14');
		save.beacon();

		expect(save.dirty).toBe(true);
	});

	it('sends nothing when there is nothing to send', () => {
		const sendBeacon = vi.fn(() => true);
		vi.stubGlobal('navigator', { sendBeacon });

		autosave().beacon();
		expect(sendBeacon).not.toHaveBeenCalled();
	});
});

/**
 * THE BATCH THAT WAS ALREADY ON THE WIRE.
 *
 * The window these three cover is about one second wide and it is the one that matters: a row
 * typed, the debounce fired, the request open — and the tab closes. The queue is empty at that
 * instant, because the request drained it, so a beacon that asked only the queue sent nothing at
 * all and let the browser cancel the `fetch` on its way out. The last row somebody typed, gone,
 * under a header that had just said "saving…".
 *
 * These are ordering tests, which is why the fetch is held open on a gate rather than mocked
 * away: the point is what is true DURING the request, not before or after it.
 */
describe('a tab closed mid-request loses nothing either', () => {
	/** A `sendBeacon` that keeps what it was handed, so the payload can be read back out. */
	function beaconStub() {
		const queued: BodyInit[] = [];
		const sendBeacon = vi.fn((_url: string, body: BodyInit) => {
			queued.push(body);
			return true;
		});
		vi.stubGlobal('navigator', { sendBeacon });
		return { sendBeacon, queued };
	}

	/** The payload the browser was actually asked to deliver. */
	async function beaconed(stub: ReturnType<typeof beaconStub>, call = 0) {
		return sent(await (stub.queued[call] as Blob).text());
	}

	/** A response that will not arrive until the test says so. */
	function gateTheResponse() {
		const gate: { release: (() => void) | null } = { release: null };
		respond = async (body: string) => {
			await new Promise<void>((resolve) => {
				gate.release = resolve;
			});
			return wroteAll(body);
		};
		return gate;
	}

	it('beacons the batch that was still in flight when the tab closed', async () => {
		const stub = beaconStub();
		gateTheResponse();

		const save = autosave();
		save.change('line-a', '14');
		await vi.advanceTimersByTimeAsync(100);
		// The request has gone and is waiting on the gate, so nothing is queued any more.
		expect(bodies).toHaveLength(1);

		save.beacon();

		expect(stub.sendBeacon).toHaveBeenCalledOnce();
		expect(await beaconed(stub)).toEqual({ lines: [{ id: 'line-a', counted: '14' }] });
	});

	/**
	 * Retyped while the first value was on the wire. The beacon has both and must send the one
	 * the person can see, not the one they had already corrected.
	 */
	it('lets a row typed since the request left win over the one in flight', async () => {
		const stub = beaconStub();
		gateTheResponse();

		const save = autosave();
		save.change('line-a', '14');
		save.change('line-b', '12');
		await vi.advanceTimersByTimeAsync(100);

		save.change('line-a', '145');
		save.beacon();

		expect(await beaconed(stub)).toEqual({
			lines: [
				{ id: 'line-a', counted: '145' },
				{ id: 'line-b', counted: '12' }
			]
		});
	});

	/**
	 * And it does not hold on to it. A payload the server acknowledged is finished work; a beacon
	 * that resent it later would overwrite whatever had been typed in the meantime.
	 */
	it('forgets the in-flight batch once the server has acknowledged it', async () => {
		const stub = beaconStub();

		const save = autosave();
		save.change('line-a', '14');
		await vi.advanceTimersByTimeAsync(100);
		expect(save.status).toBe('saved');

		save.beacon();
		expect(stub.sendBeacon).not.toHaveBeenCalled();
	});
});

/**
 * "SAVED" MEANS ALL OF IT.
 *
 * The endpoint skips a line whose id belongs to a different count — that filter is what stops one
 * sheet writing to another sheet's rows — and answers with the number it actually wrote. A 2xx on
 * its own is therefore not the claim the indicator makes when it says "saved".
 */
describe('a partly-written batch is not a save', () => {
	it('refuses to report success when the server wrote fewer rows than were sent', async () => {
		respond = async () =>
			new Response(JSON.stringify({ savedAt: '2026-08-04T19:47:00.000Z', saved: 1 }), {
				status: 200
			});

		const save = autosave();
		save.change('line-a', '14');
		save.change('line-b', '12');
		await vi.advanceTimersByTimeAsync(100);

		expect(save.status).toBe('error');
		expect(save.error).toMatch(/did not save/i);
		// No timestamp for work that is not in the database, and the rows are still queued.
		expect(save.savedAtMs).toBe(0);
		expect(save.dirty).toBe(true);
		// And it does not spin: one attempt, then it waits for a person or a keystroke.
		expect(bodies).toHaveLength(1);
	});
});
