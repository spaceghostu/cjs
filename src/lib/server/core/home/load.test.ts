/**
 * THE PROPERTY THIS SCREEN LIVES OR DIES ON: one slow module cannot block the rest of it.
 *
 * The registry and the front door are stubbed, so what is under test is the SCHEDULING —
 * which panel waits for whom, what happens when a module throws, and what happens when one
 * never answers at all. All three are invisible in a passing browser and obvious to somebody
 * on a bad connection with an unhappy database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
import type { RequestEvent } from '@sveltejs/kit';
import type { Ctx } from '../ctx';
import type { ModuleSummary, PanelKey, SummaryContributor, SummaryInput } from './types';

/** Mutable across tests: each one declares the business it is describing. */
let contributors: SummaryContributor[] = [];

vi.mock('./registry', () => ({
	contributorsFor: () => contributors,
	feeding: (cs: readonly SummaryContributor[], panel: PanelKey) =>
		cs.filter((c) => c.panels.includes(panel))
}));

// The real `withBusiness` opens a scoped transaction. Here it only has to prove that every
// contributor is handed a context of its own rather than the page load's.
vi.mock('../ctx', () => ({
	withBusiness: <T>(_event: RequestEvent, fn: (ctx: Ctx) => Promise<T>) => fn(ctx())
}));

const { loadHome, MODULE_DEADLINE_MS } = await import('./load');

const NOW = new Date('2025-08-01T17:30:00Z');

const ACCESS: AccessMap = Object.freeze({
	...NO_ACCESS,
	quoting: 'write',
	invoicing: 'write',
	inventory: 'write'
});

function ctx(): Ctx {
	return {
		tx: {} as Ctx['tx'],
		business: { locale: 'en-ZA', currency: 'ZAR' } as Ctx['business'],
		member: {} as Ctx['member'],
		userId: 'u1',
		access: ACCESS,
		requestId: 'r1'
	};
}

const event = { locals: { user: { name: 'Chantal Thornhill' } } } as unknown as RequestEvent;

const EMPTY: ModuleSummary = { standing: null, resume: [], figures: [], agenda: [] };

function contributor(
	module: ModuleKey,
	panels: readonly PanelKey[],
	summarise: (input: SummaryInput) => Promise<ModuleSummary>
): SummaryContributor {
	return { module, panels, summarise };
}

function never(): Promise<ModuleSummary> {
	return new Promise<ModuleSummary>(() => {});
}

beforeEach(() => {
	contributors = [];
	vi.useRealTimers();
});

describe('loadHome', () => {
	it('answers the two panels that need no query before any module has', () => {
		contributors = [contributor('quoting', ['standing'], never)];

		const data = loadHome(event, ctx(), NOW);

		expect(data.greeting).toBe('Friday evening, Chantal.');
		expect(data.modules.total.cents).toBe(45_000);
	});

	it('gives each contributor the same clock reading', async () => {
		const seen: Date[] = [];
		contributors = [
			contributor('quoting', ['standing'], async (input) => {
				seen.push(input.now);
				return EMPTY;
			}),
			contributor('invoicing', ['figures'], async (input) => {
				seen.push(input.now);
				return EMPTY;
			})
		];

		const data = loadHome(event, ctx(), NOW);
		await Promise.all([data.standing, data.figures]);

		expect(seen).toEqual([NOW, NOW]);
	});

	it('does not make a panel wait for a module that does not feed it', async () => {
		let settled = false;
		contributors = [
			// Inventory hangs forever and feeds only the standing panel.
			contributor('inventory', ['standing'], never),
			contributor('invoicing', ['figures'], async () => EMPTY)
		];

		const data = loadHome(event, ctx(), NOW);
		void data.standing.then(() => {
			settled = true;
		});

		const cards = await data.figures;

		// The money cards arrived. The standing panel is still waiting on Inventory, which is
		// exactly the point: the page is not one promise.
		expect(cards).toHaveLength(3);
		expect(settled).toBe(false);
	});

	it('turns a module that throws into a named gap, not an error page', async () => {
		contributors = [
			contributor('inventory', ['standing'], async () => {
				throw new Error('relation "inventory_item" does not exist');
			}),
			contributor('quoting', ['standing'], async () => ({
				...EMPTY,
				standing: {
					module: 'quoting',
					standing: 'clear',
					statement: 'Nothing quoted yet',
					explanation: 'Added 14 July.',
					href: null
				}
			}))
		];

		const panel = await loadHome(event, ctx(), NOW).standing;

		expect(panel.unavailable).toEqual(['Inventory']);
		expect(panel.points).toHaveLength(1);
		expect(panel.headline).toBe("You're all clear.");
	});

	it('stops waiting on a module that never answers', async () => {
		vi.useFakeTimers();
		contributors = [contributor('inventory', ['standing'], never)];

		const pending = loadHome(event, ctx(), NOW).standing;
		await vi.advanceTimersByTimeAsync(MODULE_DEADLINE_MS);

		// A hang and a throw are one thing from the screen's point of view: a module that has
		// not told us how it is.
		expect((await pending).unavailable).toEqual(['Inventory']);
	});

	it('composes a coherent page for a business with a single module', async () => {
		contributors = [contributor('quoting', ['standing', 'resume', 'agenda'], async () => EMPTY)];

		const data = loadHome(event, ctx(), NOW);

		expect((await data.standing).headline).toBe("You're all clear.");
		expect(await data.resume).toEqual([]);
		// Three cards even with no Invoicing, and the renewal row even with no module agenda.
		expect(await data.figures).toHaveLength(3);
		expect((await data.agenda).map((r) => r.title)).toEqual(['Your modules renew']);
	});
});
