/**
 * WHERE A JOB STANDS COMMERCIALLY — computed, never stored.
 *
 * `types.ts` explains why a job's own status says nothing about money. This file is the other
 * half of that decision: the answer to "has this been quoted, accepted, invoiced, paid?" is
 * FOLDED from the quotes and invoices linked to the job, every time it is asked, and there is no
 * column anywhere that holds it. A stored copy would be a second owner of a fact the documents
 * already own, and the two would disagree the first time one was written and the other was not.
 *
 * Pure. `today` is a parameter rather than a `new Date()` because expiry is reached by the
 * calendar — see `$lib/core/quoting/validity.ts` — and a function that reads the clock cannot be
 * asked what a job looked like yesterday, nor tested for the day a quote lapses.
 *
 * MONEY ARRIVES ALREADY CONSTRUCTED. `db/map.ts` is the door money comes through from a row, so
 * nothing here imports `$lib/core/money/ctor`; it only adds up what it is handed. That is a
 * convention this codebase keeps by hand — the ESLint zone that was meant to enforce it does not
 * currently fire (see the commit that added this file) — so it is stated here rather than
 * assumed.
 */
import { effectiveStatus, type CalendarDate, type QuoteStatus } from '$lib/core/quoting';
import { sumMoney, type Money } from '$lib/core/money';
import type { ModuleKey } from '$lib/core/modules/catalogue';
import type { StoredInvoiceStatus } from '$lib/core/invoicing';

/**
 * One of the job's quotes, reduced to the two things the fold needs.
 *
 * `validUntil` is NOT optional, and this is the whole reason the projection exists rather than a
 * bare status list: a stored `sent` on a quote whose date has passed must not read as "Quote
 * sent". Every quote is put through `effectiveStatus` before anything else looks at it.
 */
export type JobQuote = {
	readonly status: QuoteStatus;
	readonly validUntil: CalendarDate | null;
};

/**
 * One of the job's invoices, reduced the same way.
 *
 * These arrive ALREADY FILTERED to the stored statuses that can be owed — `sent`, `viewed`,
 * `paid`. The reason is written out at `modules/invoicing/queries.ts`, and it is worth repeating
 * because it is not an optimisation: a draft is owed nothing, because it has not been sent to
 * anybody; a cancelled invoice is owed nothing, because it was withdrawn. Letting either through
 * would put money in a total nobody owes.
 *
 * `outstanding` is computed by Invoicing, once, from its own settlement rules. Nothing in this
 * file re-derives it — a second implementation would eventually disagree with the first about a
 * partly-paid invoice, which is precisely what `$lib/core/invoicing/settlement.ts` exists to
 * prevent.
 */
export type JobInvoice = {
	readonly status: StoredInvoiceStatus;
	readonly total: Money;
	readonly outstanding: Money;
};

/**
 * THE EIGHT ANSWERS.
 *
 * A discriminated union rather than a string, so a screen that wants to print an amount cannot
 * reach for one in a state where there is no amount to print, and so adding a ninth member is a
 * compile error in `copy.ts` rather than a silent gap on a page.
 *
 * `untracked` is the honest one. A business that does not own Invoicing has invoices we are not
 * allowed to read, and answering "no_quote" or "accepted" from half the evidence would be a
 * confident wrong answer where "not tracked here" is a true one.
 */
export type CommercialState =
	| { readonly kind: 'no_quote' }
	| { readonly kind: 'quoted' }
	| { readonly kind: 'declined' }
	| { readonly kind: 'expired' }
	| { readonly kind: 'accepted' }
	| { readonly kind: 'invoiced'; readonly invoiced: Money; readonly outstanding: Money }
	| { readonly kind: 'settled'; readonly invoiced: Money }
	| { readonly kind: 'untracked'; readonly missing: readonly ModuleKey[] };

export type CommercialInput = {
	readonly quotes: readonly JobQuote[];
	readonly invoices: readonly JobInvoice[];
	/** Modules whose evidence could not be read, because the business does not own them. */
	readonly missing: readonly ModuleKey[];
	readonly today: CalendarDate;
};

/**
 * FOLD THE DOCUMENTS INTO ONE ANSWER, most-advanced-wins.
 *
 * The precedence is the order a piece of work actually travels, and each step is only reached
 * because the one after it did not apply:
 *
 *   1. Money is still expected on an invoice        -> `invoiced`
 *   2. There are invoices and every one is settled  -> `settled`
 *   3. A quote has been accepted                    -> `accepted`
 *   4. A quote is out and still live                -> `quoted`
 *   5. A quote was turned down                      -> `declined`
 *   6. A quote lapsed                               -> `expired`
 *   7. Nothing above                                -> `no_quote`
 *
 * Two consequences worth stating, because both look like bugs until they are read as decisions.
 *
 * A job with an accepted quote AND a declined one reads as `accepted`: the client said yes to
 * something, and the refusal of an earlier version of the work is not the headline.
 *
 * A job whose only quote is a DRAFT reads as `no_quote`. A draft has been offered to nobody, so
 * it is closer to "we have not quoted this yet" than to any answer about a quote — and it is the
 * one quote status that is invisible to the client the whole thing is about.
 */
export function commercialState(input: CommercialInput): CommercialState {
	// Checked first: an answer assembled from evidence we were not allowed to read is worse
	// than no answer, and this is the only branch that can say so.
	if (input.missing.length > 0) return { kind: 'untracked', missing: input.missing };

	const invoices = input.invoices;

	const first = invoices[0];
	if (first) {
		// The currency comes from the documents themselves rather than from a default, and
		// `sumMoney` refuses a list that mixes two — which cannot happen while `CurrencyCode`
		// has one member, and will be caught the day it has two.
		const currency = first.total.currency;
		const invoiced = sumMoney(
			currency,
			invoices.map((i) => i.total)
		);
		const outstanding = sumMoney(
			currency,
			invoices.map((i) => i.outstanding)
		);

		if (outstanding.cents > 0) return { kind: 'invoiced', invoiced, outstanding };
		return { kind: 'settled', invoiced };
	}

	const statuses = input.quotes.map((q) => effectiveStatus(q.status, q.validUntil, input.today));

	if (statuses.includes('accepted')) return { kind: 'accepted' };
	if (statuses.includes('sent') || statuses.includes('viewed')) return { kind: 'quoted' };
	if (statuses.includes('declined')) return { kind: 'declined' };
	if (statuses.includes('expired')) return { kind: 'expired' };

	return { kind: 'no_quote' };
}
