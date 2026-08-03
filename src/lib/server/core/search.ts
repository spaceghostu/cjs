/**
 * WHAT THE COMMAND BAR SEARCHES.
 *
 * Two hard rules come out of the design and both are structural here rather than
 * documented:
 *
 *   NOTHING IS REACHABLE ONLY THROUGH THIS BAR. Every `destination` hit below comes from
 *   `navItems()` — the same function the sidebar and the bottom nav read. It is not possible
 *   to add a destination here without also adding it to both navs, because there is one
 *   list. `search.test.ts` asserts the containment anyway, since that is the claim.
 *
 *   RESULTS CANNOT CROSS A TENANT. Every record query runs on `ctx.tx`, which is the branded
 *   handle from `withBusiness` — the session variable is set, so Row Level Security has
 *   already decided whose rows exist. There is no `where business_id = …` anywhere in this
 *   file, and adding one would be a second, weaker answer to a question the database has
 *   settled.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * Ask. The design's "or ask a question" half is an assistant, and this ticket delivers the
 * seam rather than the model: see `draftedResult` at the foot of the file.
 */
import { and, ilike, isNull, or } from 'drizzle-orm';
import { customer as customerTable } from './db/schema/core';
import { navItems } from '$lib/components/shell/nav';
import { SEARCH_KIND_LABELS, rankHits, type SearchGroup, type SearchHit } from '$lib/core/search';
import type { AccessMap } from './entitlement';
import type { Ctx } from './ctx';

/**
 * How many of each kind. Small on purpose: a keyboard list is scanned, not paged, and the
 * answer to "there are more" is a better query rather than a longer list.
 */
export const PER_KIND_LIMIT = 5;

/** Below this a query matches most of the business, which is not a search result. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Places, from the one nav list.
 *
 * A locked module is deliberately INCLUDED: its route renders the design's locked state, so
 * the person who typed "payroll" gets a calm offer instead of nothing. Refusing to show it
 * would also be a difference between what search knows and what the sidebar shows.
 */
export function destinations(access: AccessMap, query: string): SearchHit[] {
	const items = rankHits(navItems(access), query, (item) => item.label);

	return items.slice(0, PER_KIND_LIMIT).map((item) => ({
		kind: 'destination' as const,
		id: item.href,
		title: item.label,
		subtitle: item.access === 'none' ? 'Not added yet' : undefined,
		href: item.href
	}));
}

/**
 * Customers, from `core_customer`.
 *
 * Archived customers are excluded: they are kept so that an old invoice stays resolvable
 * forever, not so that they clutter a live search. Nothing is deleted, so this is the only
 * place the distinction shows up.
 */
async function customers(ctx: Ctx, query: string): Promise<SearchHit[]> {
	const rows = await ctx.tx
		.select({
			id: customerTable.id,
			name: customerTable.name,
			city: customerTable.city,
			contactPerson: customerTable.contactPerson
		})
		.from(customerTable)
		.where(
			and(
				isNull(customerTable.archivedAt),
				or(
					ilike(customerTable.name, `%${query}%`),
					ilike(customerTable.contactPerson, `%${query}%`)
				)
			)
		)
		// Wider than the limit, then ranked in memory: Postgres can tell us WHICH rows match
		// but not that a prefix match should outrank one buried in the middle of a name.
		.limit(PER_KIND_LIMIT * 4);

	return rankHits(rows, query, (row) => row.name)
		.slice(0, PER_KIND_LIMIT)
		.map((row) => ({
			kind: 'customer' as const,
			id: row.id,
			title: row.name,
			subtitle: row.city ?? row.contactPerson ?? undefined,
			href: `/customers/${row.id}`
		}));
}

/**
 * THE SEAM FOR THE RECORD MODULES.
 *
 * Quotes (T15/T16), invoices (T19/T20) and stock items (T23) have no tables yet. Each will
 * add its own function beside `customers` and its own entry in the list below — and each
 * must gate on `ctx.access`, because a module a business has REMOVED is still readable and
 * its records must still be findable, while one it has never owned has nothing to find.
 */
export async function searchBusiness(ctx: Ctx, rawQuery: string): Promise<readonly SearchGroup[]> {
	const query = rawQuery.trim();
	if (query.length < MIN_QUERY_LENGTH) return [];

	const groups: SearchGroup[] = [];

	const places = destinations(ctx.access, query);
	if (places.length > 0) {
		groups.push({ kind: 'destination', label: SEARCH_KIND_LABELS.destination, hits: places });
	}

	const people = await customers(ctx, query);
	if (people.length > 0) {
		groups.push({ kind: 'customer', label: SEARCH_KIND_LABELS.customer, hits: people });
	}

	return groups;
}

/**
 * THE ASK SEAM.
 *
 * The design: "Anything it drafts arrives in the normal form, labelled, for you to send."
 * Two things follow, and both are shape rather than model, so both belong here now — a seam
 * defined after the first assistant is written is a seam that was designed around whatever
 * that assistant happened to return.
 *
 * A drafted result NEVER commits. It names a form and the values to open it with, and the
 * form renders the `assisted` badge — "Drafted for you · check it", already built in T02 —
 * until a person presses the button that saves it. There is no field on this type that
 * could express "and save it": that is the enforcement.
 */
export type DraftedResult = {
	/** The route of the ordinary form this opens. Never an endpoint, never an action. */
	readonly opens: string;
	/** Prefilled values, as form fields. The form validates them like any other input. */
	readonly values: Readonly<Record<string, string>>;
	/** Shown verbatim beside the badge, so the person knows what was assumed. */
	readonly explanation: string;
};

/**
 * Is this a question or a search?
 *
 * The bar has one input and two behaviours, so something has to decide. The rule is
 * deliberately dull and legible: a question mark, or an opening that reads as a request.
 * When it is wrong the cost is a list of search results for a question — recoverable, and
 * visible — rather than a draft nobody asked for.
 *
 * Search runs regardless. `looksLikeQuestion` decides whether ASK is *also* offered, which
 * is what keeps the bar useful with AI turned off.
 */
const QUESTION_OPENERS = [
	'how ',
	'what ',
	'why ',
	'when ',
	'who ',
	'where ',
	'can ',
	'should ',
	'draft ',
	'write ',
	'create ',
	'show me '
];

export function looksLikeQuestion(query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q.length === 0) return false;
	if (q.endsWith('?')) return true;
	return QUESTION_OPENERS.some((opener) => q.startsWith(opener));
}

export type { SearchGroup, SearchHit };
