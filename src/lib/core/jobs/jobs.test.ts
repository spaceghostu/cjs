/**
 * THE DERIVATION, PINNED.
 *
 * Every case here is a statement SPA-20 makes about what a job's commercial state IS, and
 * several of them are statements about what it is NOT — that a job's own status never moves
 * because money did, that invoice totals need not add up to any quote, that a draft invoice is
 * not money owed. An absence is only demonstrable by a test that would catch its presence, so
 * those are written as assertions rather than left implied.
 *
 * Pure: no database, no clock, no network. `commercialState` takes `today` as a parameter for
 * exactly that reason.
 */
import { describe, expect, it } from 'vitest';
import { ZAR } from '$lib/core/money';
import { money } from '$lib/core/money/ctor';
import type { CalendarDate } from '$lib/core/calendar';
import type { ModuleKey } from '$lib/core/modules/catalogue';
import {
	commercialSentence,
	commercialState,
	statusLabel,
	type CommercialState,
	type JobInvoice,
	type JobQuote,
	type JobStatus
} from './index';

const TODAY = '2026-08-30' as CalendarDate;
const AFTER = '2026-09-30' as CalendarDate;

const rand = (amount: number) => money(amount * 100, ZAR);

function quote(over: Partial<JobQuote> = {}): JobQuote {
	return { status: 'sent', validUntil: null, ...over };
}

function invoice(total: number, outstanding: number, status: JobInvoice['status'] = 'sent') {
	return { status, total: rand(total), outstanding: rand(outstanding) };
}

function state(
	over: {
		quotes?: readonly JobQuote[];
		invoices?: readonly JobInvoice[];
		missing?: readonly ModuleKey[];
		today?: CalendarDate;
	} = {}
): CommercialState {
	return commercialState({
		quotes: over.quotes ?? [],
		invoices: over.invoices ?? [],
		missing: over.missing ?? [],
		today: over.today ?? TODAY
	});
}

describe('a job billed in phases', () => {
	/**
	 * The ticket's own worked example: one job, three invoices, two of them settled. The job is
	 * `invoiced` because money is still expected — most-advanced-wins would be wrong here if it
	 * read "any invoice paid" as settled.
	 */
	it('one job, three invoices in phases — two settled, one outstanding', () => {
		const derived = state({
			quotes: [quote({ status: 'accepted' })],
			invoices: [invoice(1000, 0, 'paid'), invoice(1000, 0, 'paid'), invoice(2400, 2400, 'sent')]
		});

		expect(derived.kind).toBe('invoiced');
		if (derived.kind !== 'invoiced') return;
		expect(derived.outstanding.cents).toBe(240_000);
		expect(derived.invoiced.cents).toBe(440_000);
	});

	/**
	 * Deliberate, and the reason the derivation reads invoices rather than comparing them to a
	 * quote: a job invoiced in phases, with a variation added halfway, bills more than it was
	 * quoted. Nothing in here treats that as an error, because it is not one.
	 */
	it('does not require the invoices to sum to the quote', () => {
		const derived = state({
			quotes: [quote({ status: 'accepted' })],
			invoices: [invoice(5000, 5000)]
		});

		expect(derived.kind).toBe('invoiced');
	});

	it('settling every invoice changes the derivation and nothing else', () => {
		const before = state({ invoices: [invoice(1000, 0, 'paid'), invoice(2400, 2400)] });
		const after = state({ invoices: [invoice(1000, 0, 'paid'), invoice(2400, 0, 'paid')] });

		expect(before.kind).toBe('invoiced');
		expect(after.kind).toBe('settled');
		if (after.kind !== 'settled') return;
		expect(after.invoiced.cents).toBe(340_000);
		// No job status appears in this case, and that absence IS the claim: `commercialState`
		// takes quotes, invoices, entitlements and a date, and there is no parameter through
		// which a status could reach it. Declaring one here to assert it had not changed would
		// have been a local variable checking its own initialiser. The version of this claim
		// that can fail is in the database suite, where a stored status is read back after the
		// money moves — 'settling everything moves the derivation and leaves the status
		// byte-identical'.
	});
});

/**
 * DRAFT AND CANCELLED ARE FILTERED UPSTREAM, NOT HERE.
 *
 * `invoicesForJob` admits only stored `sent`, `viewed` and `paid`, so this function is never
 * handed a draft or a cancelled invoice and contains no branch that would recognise one. These
 * two cases therefore assert what the derivation does with what SURVIVES that filter — they are
 * not, and cannot be, evidence that the filter exists. The filter itself is held in place by
 * `src/lib/server/core/jobs/jobs.test.ts`, which cancels a real invoice against a real database
 * and checks that the job's figures do not move; naming these two after the filter would have
 * left that job to a test that could not do it.
 */
describe('what reaches the derivation once the query has filtered', () => {
	it('a job whose only invoice was filtered out still reads from its quote', () => {
		// The empty list is what `invoicesForJob` returns for a job carrying nothing but a draft.
		// With no money in evidence, the accepted quote is the most advanced thing known.
		const derived = state({ quotes: [quote({ status: 'accepted' })], invoices: [] });
		expect(derived.kind).toBe('accepted');
	});

	it('sums only the invoices it is given, and invents nothing beside them', () => {
		// One live invoice in, one live invoice's figures out. A job that also carried a
		// withdrawn R1 000 would arrive here looking exactly like this.
		const derived = state({ invoices: [invoice(2400, 2400)] });
		expect(derived.kind).toBe('invoiced');
		if (derived.kind !== 'invoiced') return;
		expect(derived.invoiced.cents).toBe(240_000);
		expect(derived.outstanding.cents).toBe(240_000);
	});
});

describe('quotes are read through their calendar', () => {
	it('a quote past its valid-until reads as lapsed, not sent', () => {
		const sent = [quote({ status: 'sent', validUntil: '2026-09-01' as CalendarDate })];

		expect(state({ quotes: sent, today: TODAY }).kind).toBe('quoted');
		expect(state({ quotes: sent, today: AFTER }).kind).toBe('expired');
	});

	it('a job whose only quote is a draft reads as no_quote', () => {
		expect(state({ quotes: [quote({ status: 'draft' })] }).kind).toBe('no_quote');
	});

	it('declined and expired are distinct outcomes', () => {
		expect(state({ quotes: [quote({ status: 'declined' })] }).kind).toBe('declined');
		expect(state({ quotes: [quote({ status: 'expired' })] }).kind).toBe('expired');
	});

	it('an accepted quote beats a declined one on the same job', () => {
		const derived = state({
			quotes: [quote({ status: 'declined' }), quote({ status: 'accepted' })]
		});
		expect(derived.kind).toBe('accepted');
	});
});

describe('the money half of the two independent facts', () => {
	/**
	 * The ticket's headline is "done, R2 400 outstanding": a status the person set, and a
	 * commercial state nobody set at all. Only the second half is provable HERE, because a pure
	 * derivation that is never shown a status cannot demonstrate anything about one — the pair
	 * needs a row with both columns on it, and that case lives in the database suite. What this
	 * file contributes is the half it owns, stated so the other half has something to pair with.
	 */
	it('money still owed is a state the derivation can reach on its own', () => {
		// Half of the ticket's headline, and the only half this file can prove: R2 400 is
		// outstanding, derived from invoices alone with no status anywhere in the input. That
		// `job.status` is free to say 'done' at the same moment is a fact about two columns and
		// is asserted where both exist — `src/lib/server/core/jobs/jobs.test.ts`, 'reads as done
		// and invoiced at once, which is the whole point'.
		const derived = state({ invoices: [invoice(2400, 2400)] });

		expect(derived.kind).toBe('invoiced');
		if (derived.kind !== 'invoiced') return;
		expect(derived.outstanding.cents).toBe(240_000);
	});
});

describe('degrading honestly', () => {
	it('is untracked when Invoicing is not part of the business', () => {
		const derived = state({
			quotes: [quote({ status: 'accepted' })],
			invoices: [],
			missing: ['invoicing']
		});

		expect(derived.kind).toBe('untracked');
		if (derived.kind !== 'untracked') return;
		expect(derived.missing).toEqual(['invoicing']);
	});
});

describe('the words', () => {
	const all: readonly CommercialState[] = [
		{ kind: 'no_quote' },
		{ kind: 'quoted' },
		{ kind: 'declined' },
		{ kind: 'expired' },
		{ kind: 'accepted' },
		{ kind: 'invoiced', invoiced: rand(2400), outstanding: rand(2400) },
		{ kind: 'settled', invoiced: rand(2400) },
		{ kind: 'untracked', missing: ['invoicing'] }
	];

	it('says something plain for every commercial state', () => {
		for (const one of all) {
			const sentence = commercialSentence(one);
			expect(sentence.length).toBeGreaterThan(0);
			expect(sentence).not.toMatch(/[_A-Z]{4,}/);
		}
	});

	it('names the outstanding amount when there is one', () => {
		const sentence = commercialSentence({
			kind: 'invoiced',
			invoiced: rand(2400),
			outstanding: rand(2400)
		});
		// The grouping separator is a non-breaking space, so this asks for the digits rather
		// than for a particular byte between them.
		expect(sentence).toMatch(/2.400/);
	});

	it('labels every job status in plain words', () => {
		const statuses: readonly JobStatus[] = [
			'unscheduled',
			'scheduled',
			'in_progress',
			'done',
			'on_hold',
			'cancelled'
		];

		for (const one of statuses) {
			expect(statusLabel(one).length).toBeGreaterThan(0);
			expect(statusLabel(one)).not.toContain('_');
		}
	});
});
