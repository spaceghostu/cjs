/**
 * THE PROMISE, UNDER TEST.
 *
 *   "All changes saved · 21:47. You can close this and come back."
 *
 * Four claims, one describe block each. None of them needs a component mounted, which is why
 * `Autosave` is a class in a `.svelte.ts` file rather than logic inside `QuoteEditor` — the
 * hard part of an autosaving editor is the ordering, and ordering is testable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosave, clockTime } from './state.svelte.js';
import type { DraftPatch } from '$lib/core/quoting/wire';

const PATCH = {
	customerId: null,
	customer: {
		name: 'Fynbos Interiors',
		contactPerson: null,
		email: null,
		phone: null,
		vatNumber: null,
		addressLine1: null,
		addressLine2: null,
		city: null,
		postalCode: null
	},
	sendToName: null,
	sendToEmail: null,
	validUntil: null,
	deposit: { kind: 'none' },
	lines: []
} satisfies DraftPatch;

/** A patch that is distinguishable from the one before it. */
function patchNamed(name: string): DraftPatch {
	return { ...PATCH, customer: { ...PATCH.customer, name } };
}

let bodies: string[];
let respond: (body: string) => Promise<Response>;

beforeEach(() => {
	vi.useFakeTimers();
	bodies = [];
	respond = async () =>
		new Response(JSON.stringify({ savedAt: '2026-08-04T19:47:00.000Z' }), { status: 200 });

	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			bodies.push(String(init.body));
			return respond(String(init.body));
		})
	);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function autosave(delayMs = 100) {
	return new Autosave({ endpoint: '/quoting/q1/save', savedAtMs: 0, delayMs });
}

describe('the indicator never guesses', () => {
	it('shows the time the SERVER wrote, not the time we asked', async () => {
		const save = autosave();
		save.change(PATCH);

		expect(save.status).toBe('pending');
		await vi.advanceTimersByTimeAsync(100);

		expect(save.status).toBe('saved');
		// The database's `updated_at`, arriving as ISO. An optimistic `Date.now()` here would
		// show "saved" for a save that failed.
		expect(save.savedAtMs).toBe(Date.parse('2026-08-04T19:47:00.000Z'));
	});

	it('says so out loud when a save fails, and keeps the work', async () => {
		respond = async () =>
			new Response(JSON.stringify({ message: 'That quote has already been sent.' }), {
				status: 409
			});

		const save = autosave();
		save.change(PATCH);
		await vi.advanceTimersByTimeAsync(100);

		expect(save.status).toBe('error');
		expect(save.error).toBe('That quote has already been sent.');
		// The payload is still held, so the next keystroke or the closing tab still carries it.
		// Losing it here is the one outcome the promise forbids.
		expect(save.dirty).toBe(true);
	});
});

describe('one save at a time', () => {
	it('coalesces a burst of typing into a single request', async () => {
		const save = autosave();

		save.change(patchNamed('F'));
		save.change(patchNamed('Fy'));
		save.change(patchNamed('Fyn'));
		await vi.advanceTimersByTimeAsync(100);

		expect(bodies).toHaveLength(1);
		expect(bodies[0]).toContain('"name":"Fyn"');
	});

	it('does not let two saves overtake each other', async () => {
		// A slow first request, and something typed while it is in flight. Two concurrent saves
		// can arrive in either order, and the loser silently wins — so the second one waits.
		let release: (() => void) | null = null;
		respond = async () => {
			await new Promise<void>((resolve) => (release = resolve));
			return new Response(JSON.stringify({ savedAt: '2026-08-04T19:47:00.000Z' }), { status: 200 });
		};

		const save = autosave();
		save.change(patchNamed('first'));
		await vi.advanceTimersByTimeAsync(100);

		expect(bodies).toHaveLength(1);

		save.change(patchNamed('second'));
		await vi.advanceTimersByTimeAsync(100);

		// Still one in flight: the second is queued rather than racing the first.
		expect(bodies).toHaveLength(1);

		respond = async () =>
			new Response(JSON.stringify({ savedAt: '2026-08-04T19:48:00.000Z' }), { status: 200 });
		release!();
		await vi.advanceTimersByTimeAsync(0);

		expect(bodies).toHaveLength(2);
		expect(bodies[1]).toContain('"name":"second"');
	});
});

describe('the closed tab', () => {
	it('flushes through sendBeacon, which survives the page', async () => {
		const sendBeacon = vi.fn(() => true);
		vi.stubGlobal('navigator', { sendBeacon });

		const save = autosave(10_000);
		save.change(PATCH);
		// Nowhere near the debounce. A `fetch` here would be cancelled with the document.
		save.beacon();

		expect(sendBeacon).toHaveBeenCalledOnce();
		expect(save.dirty).toBe(false);
	});

	it('falls back to a fetch where sendBeacon is unavailable', async () => {
		vi.stubGlobal('navigator', {});

		const save = autosave(10_000);
		save.change(PATCH);
		save.beacon();
		await vi.advanceTimersByTimeAsync(0);

		expect(bodies).toHaveLength(1);
	});

	it('sends nothing when there is nothing to send', () => {
		const sendBeacon = vi.fn(() => true);
		vi.stubGlobal('navigator', { sendBeacon });

		autosave().beacon();
		expect(sendBeacon).not.toHaveBeenCalled();
	});
});

describe('flushing before something irreversible', () => {
	it('sends immediately rather than waiting out the debounce', async () => {
		// What `send` does. Emailing a client a document that is missing the last thing somebody
		// typed is the failure this prevents.
		const save = autosave(10_000);
		save.change(PATCH);

		await save.flush();

		expect(bodies).toHaveLength(1);
		expect(save.status).toBe('saved');
	});

	it('is a no-op when nothing has changed', async () => {
		await autosave().flush();
		expect(bodies).toHaveLength(0);
	});
});

describe('the clock', () => {
	it('reads 24-hour, zero-padded, like the design', () => {
		const at = new Date(2026, 7, 4, 21, 47);
		expect(clockTime(at.getTime())).toBe('21:47');

		const early = new Date(2026, 7, 4, 9, 5);
		expect(clockTime(early.getTime())).toBe('09:05');
	});
});
