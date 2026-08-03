/**
 * WHAT A SEARCH RESULT IS.
 *
 * The shape only — the query lives in `$lib/server/core/search`, which is the half that
 * touches a database and must never be importable from a component. This file is the wire
 * format both ends agree on: the command bar renders it, the endpoint serialises it, and
 * neither has to import the other's module to know its fields.
 */

/**
 * Grouped by what a thing IS, because the design groups results by type and because "which
 * of these is a customer" is the question a person is actually asking of a mixed list.
 *
 * `destination` is a place in the product rather than a record. It is first in the union and
 * first on screen: someone typing "inv" more often wants the Invoicing screen than the 40th
 * invoice.
 */
export const SEARCH_KINDS = ['destination', 'customer', 'quote', 'invoice', 'item'] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_KIND_LABELS: Readonly<Record<SearchKind, string>> = Object.freeze({
	destination: 'Go to',
	customer: 'Customers',
	quote: 'Quotes',
	invoice: 'Invoices',
	item: 'Stock'
});

export type SearchHit = {
	readonly kind: SearchKind;
	/** Stable within a kind. The row id, or the route for a destination. */
	readonly id: string;
	readonly title: string;
	/** The second line: a customer's town, an invoice's client. Optional by design. */
	readonly subtitle?: string;
	readonly href: string;
	/** A document number or an amount — rendered mono, like every other numeral. */
	readonly meta?: string;
};

export type SearchGroup = {
	readonly kind: SearchKind;
	readonly label: string;
	readonly hits: readonly SearchHit[];
};

/** Every hit across every group. What the announcer counts and what a test enumerates. */
export function allHits(groups: readonly SearchGroup[]): readonly SearchHit[] {
	return groups.flatMap((g) => g.hits);
}

/**
 * RANKING, such as it is.
 *
 * A prefix match beats a match in the middle of the string, and after that it is
 * alphabetical. Deliberately not a fuzzy scorer: this list is keyboard-driven and the person
 * is watching it change as they type, so an order they can predict beats a cleverer one
 * they cannot. Case- and accent-insensitive, because "andré" and "Andre" are one customer.
 */
export function normalise(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim();
}

export function matchRank(haystack: string, needle: string): number | null {
	const index = normalise(haystack).indexOf(normalise(needle));
	if (index < 0) return null;
	return index;
}

export function rankHits<T>(
	rows: readonly T[],
	needle: string,
	text: (row: T) => string
): readonly T[] {
	return rows
		.flatMap((row) => {
			const rank = matchRank(text(row), needle);
			return rank === null ? [] : [{ row, rank, sort: normalise(text(row)) }];
		})
		.sort((a, b) => a.rank - b.rank || a.sort.localeCompare(b.sort))
		.map((r) => r.row);
}
