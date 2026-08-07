/**
 * COMPOSITION, WITHOUT A BUSINESS.
 *
 * Every interesting case on this screen is a case about ABSENCE — no modules, one module, a
 * module that did not answer, a slot nothing owns — and none of them needs a database to
 * reproduce. That is the whole reason `compose.ts` is pure.
 */
import { describe, expect, it } from 'vitest';
import { composeAgenda, composeFigures, composeResume, composeStanding } from './compose';
import { NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
import { toMoney } from '../db/map';
import type { AgendaContribution, Contribution, ModuleSummary } from './types';
import type { ResumeCard, StandingPoint } from '$lib/core/home';

const LOCALE = 'en-ZA';
/** A Friday evening in early August — the design's own scenario. */
const NOW = new Date('2025-08-01T17:30:00Z');

function owning(...keys: readonly ModuleKey[]): AccessMap {
	return Object.freeze({
		...NO_ACCESS,
		...Object.fromEntries(keys.map((key) => [key, 'write' as const]))
	});
}

function ok(module: ModuleKey, summary: Partial<ModuleSummary>): Contribution {
	return {
		status: 'ok',
		module,
		summary: { standing: null, resume: [], figures: [], agenda: [], ...summary }
	};
}

function reassurance(module: ModuleKey, statement: string): StandingPoint {
	return { module, standing: 'clear', statement, explanation: 'All good.', href: null };
}

function concern(module: ModuleKey, statement: string): StandingPoint {
	return { module, standing: 'attention', statement, explanation: 'Since Tuesday.', href: '/x' };
}

describe('composeStanding', () => {
	it('gives a business with no modules a complete panel', () => {
		const panel = composeStanding([]);

		expect(panel.standing).toBe('clear');
		expect(panel.headline).toBe("You're all clear.");
		expect(panel.points).toEqual([]);
		expect(panel.unavailable).toEqual([]);
	});

	it('gives a business with one module a coherent panel, not a gap', () => {
		const panel = composeStanding([ok('quoting', { standing: reassurance('quoting', 'Nothing') })]);

		expect(panel.points).toHaveLength(1);
		expect(panel.standing).toBe('clear');
	});

	it('leads with the concern when a module raises one', () => {
		const panel = composeStanding([
			ok('quoting', { standing: reassurance('quoting', 'Quotes fine') }),
			ok('invoicing', { standing: concern('invoicing', '2 invoices overdue') })
		]);

		expect(panel.standing).toBe('attention');
		expect(panel.headline).toBe('One thing needs you.');
		expect(panel.points[0].statement).toBe('2 invoices overdue');
	});

	it('names a module it could not reach rather than claiming all clear over it', () => {
		const panel = composeStanding([
			ok('quoting', { standing: reassurance('quoting', 'Quotes fine') }),
			{ status: 'failed', module: 'inventory' }
		]);

		// The headline is still the honest roll-up of what DID answer — and the panel says what
		// it did not hear from, because "all clear" is a claim about everything.
		expect(panel.unavailable).toEqual(['Inventory']);
		expect(panel.points).toHaveLength(1);
	});
});

describe('composeResume', () => {
	function card(module: ModuleKey, id: string): ResumeCard {
		return { module, id, title: id, context: '3 of 5 priced', href: `/${id}` };
	}

	it('collects the drafts from every module, in registry order', () => {
		const cards = composeResume([
			ok('quoting', { resume: [card('quoting', 'q1')] }),
			ok('invoicing', { resume: [card('invoicing', 'i1')] })
		]);

		expect(cards.map((c) => c.id)).toEqual(['q1', 'i1']);
	});

	it('is empty when nobody has one, so the section can be absent rather than blank', () => {
		expect(composeResume([ok('quoting', {})])).toEqual([]);
	});

	it('caps the list, because a list of every draft is the module screen', () => {
		const cards = composeResume([
			ok('quoting', { resume: [card('quoting', 'a'), card('quoting', 'b')] }),
			ok('invoicing', { resume: [card('invoicing', 'c'), card('invoicing', 'd')] })
		]);

		expect(cards).toHaveLength(3);
	});
});

describe('composeFigures', () => {
	it('always renders three cards, in the order the design lists them', () => {
		const cards = composeFigures([], NO_ACCESS, NOW, LOCALE);

		expect(cards.map((c) => c.slot)).toEqual(['owed-to-you', 'you-owe', 'paid-to-you']);
	});

	it('never renders a zero for a figure nobody contributed', () => {
		const cards = composeFigures([], owning('invoicing'), NOW, LOCALE);

		// R0 owed and nothing to go on look identical on a card and mean opposite things.
		expect(cards[0].amount).toBeNull();
		expect(cards[0].footnote).toBe('Nothing invoiced yet.');
	});

	it('says which truth is missing when the module is not owned', () => {
		const cards = composeFigures([], NO_ACCESS, NOW, LOCALE);

		expect(cards[0].footnote).toContain("isn't part of your business");
	});

	it('renders "Money you owe" honestly, because Expenses does not exist', () => {
		const cards = composeFigures([], owning('invoicing', 'quoting'), NOW, LOCALE);

		expect(cards[1].amount).toBeNull();
		expect(cards[1].footnote).toContain('Expenses');
	});

	it('does not claim "nothing invoiced" when Invoicing failed to answer', () => {
		const cards = composeFigures(
			[{ status: 'failed', module: 'invoicing' }],
			owning('invoicing'),
			NOW,
			LOCALE
		);

		expect(cards[0].amount).toBeNull();
		expect(cards[0].footnote).toContain("didn't answer");
	});

	it('colours the receivable and nothing else', () => {
		const cards = composeFigures(
			[
				ok('invoicing', {
					figures: [
						{ slot: 'owed-to-you', amount: toMoney(2_415_000), footnote: 'Across 6 invoices' },
						{ slot: 'paid-to-you', amount: toMoney(13_140_000), footnote: 'June was R131 400' }
					]
				})
			],
			owning('invoicing'),
			NOW,
			LOCALE
		);

		expect(cards[0].emphasis).toBe('receivable');
		expect(cards[2].emphasis).toBe('plain');
		expect(cards[0].amount?.cents).toBe(2_415_000);
	});

	it('names the month that just ended, in the billing calendar', () => {
		const cards = composeFigures([], owning('invoicing'), NOW, LOCALE);

		expect(cards[2].label).toBe('Paid to you in July');
	});

	it('rolls the year back in January', () => {
		const cards = composeFigures([], owning('invoicing'), new Date('2025-01-09T08:00:00Z'), LOCALE);

		expect(cards[2].label).toBe('Paid to you in December');
	});
});

describe('composeAgenda', () => {
	function item(id: string, on: string): AgendaContribution {
		return { id, on: new Date(on), title: id, detail: null };
	}

	it('orders every contribution by date, whoever sent it', () => {
		const rows = composeAgenda(
			[ok('invoicing', { agenda: [item('late', '2025-08-25T00:00:00Z')] })],
			[item('early', '2025-08-02T00:00:00Z')],
			LOCALE
		);

		expect(rows.map((r) => r.id)).toEqual(['early', 'late']);
	});

	it('formats the date on the server, in the business locale', () => {
		const rows = composeAgenda([], [item('renewal', '2025-09-01T00:00:00Z')], LOCALE);

		// en-ZA's own short form, not the design's en-GB "1 Sep". The business's locale wins:
		// a date the product renders differently from the one the owner's phone does is a date
		// they have to translate.
		expect(rows[0].dateLabel).toBe('01 Sept');
	});

	it('bounds the column', () => {
		const many = Array.from({ length: 9 }, (_, i) => item(`i${i}`, `2025-08-0${i + 1}T00:00:00Z`));

		expect(composeAgenda([], many, LOCALE)).toHaveLength(6);
	});
});
