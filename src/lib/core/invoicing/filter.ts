/**
 * THE FILTER TABS — `All 24 · Unpaid 6 · Overdue 0 · Paid 16 · Drafts 2`.
 *
 * Counts inline rather than as badges, and **a zero count is shown**. The design is explicit
 * about `Overdue 0`: "'Overdue: none' is stated rather than hidden". Hiding an empty tab would
 * mean the one number an owner most wants confirmed — that nothing is late — disappears exactly
 * when it is good news, and reappears only when it is bad.
 *
 * The predicate is here rather than in the query so that the tab counts, the visible rows and
 * the CSV export cannot disagree about what "Unpaid" means. The server counts with SQL for
 * speed; `invoicing.test.ts` asserts the two agree.
 */
import type { InvoiceStatus } from './types';

export const INVOICE_FILTERS = ['all', 'unpaid', 'overdue', 'paid', 'drafts'] as const;

export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

export function isInvoiceFilter(value: unknown): value is InvoiceFilter {
	return typeof value === 'string' && (INVOICE_FILTERS as readonly string[]).includes(value);
}

const LABELS: Readonly<Record<InvoiceFilter, string>> = Object.freeze({
	all: 'All',
	unpaid: 'Unpaid',
	overdue: 'Overdue',
	paid: 'Paid',
	drafts: 'Drafts'
});

export function filterLabel(filter: InvoiceFilter): string {
	return LABELS[filter];
}

/**
 * Does this invoice belong under that tab?
 *
 * `unpaid` INCLUDES overdue, because an overdue invoice is unpaid — the Overdue tab narrows the
 * Unpaid one rather than partitioning it. The design's own counts say so: 6 unpaid with 0
 * overdue, and an owner reading "6 unpaid, none overdue" would be badly served by a tab that
 * quietly dropped late invoices out of the six.
 *
 * A cancelled invoice appears under `all` and nowhere else. It is not owed, not paid and not a
 * draft; it is a document that was withdrawn, and the only honest place for it is the full list.
 */
export function matchesFilter(filter: InvoiceFilter, status: InvoiceStatus): boolean {
	switch (filter) {
		case 'all':
			return true;
		case 'unpaid':
			return status === 'sent' || status === 'viewed' || status === 'overdue';
		case 'overdue':
			return status === 'overdue';
		case 'paid':
			return status === 'paid';
		case 'drafts':
			return status === 'draft';
	}
}

/**
 * WHAT THE TABLE CAN BE SORTED BY.
 *
 * Four columns, because those are the four questions somebody actually asks of a list of
 * invoices: when did it go out, when is it due, who is it for, how much is it. `Status` is not
 * among them — it is derived from a date, so sorting by it is sorting by the due date with an
 * extra step, and `Invoice` sorts identically to `Issued` because the numbers are sequential.
 *
 * In the URL rather than in a rune, for the same reason the filter is: a sorted list can then be
 * bookmarked, shared and reloaded, and the back button does what it looks like it does.
 */
export const INVOICE_SORTS = ['issued', 'due', 'client', 'amount'] as const;

export type InvoiceSort = (typeof INVOICE_SORTS)[number];

export function isInvoiceSort(value: unknown): value is InvoiceSort {
	return typeof value === 'string' && (INVOICE_SORTS as readonly string[]).includes(value);
}

export type SortDirection = 'asc' | 'desc';

export function isSortDirection(value: unknown): value is SortDirection {
	return value === 'asc' || value === 'desc';
}

/**
 * The direction a column starts in when somebody first clicks it.
 *
 * Dates and amounts open DESCENDING, because "the newest" and "the biggest" are what a person
 * means by sorting them. A name opens ascending, because that is alphabetical order.
 */
export function defaultDirection(sort: InvoiceSort): SortDirection {
	return sort === 'client' ? 'asc' : 'desc';
}
