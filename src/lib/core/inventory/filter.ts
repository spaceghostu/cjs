/**
 * THE FILTER TABS — `All 48 · Running low 3 · Archived 2`.
 *
 * Counts inline rather than as badges, and **a zero count is shown**, for the reason T20 gives
 * about `Overdue 0`: hiding an empty tab makes the one number an owner most wants confirmed —
 * that nothing is running low — disappear exactly when it is good news, and reappear only when
 * it is bad.
 *
 * Three tabs, not more. `all` is the list; `low` is the module's one piece of genuine urgency;
 * `archived` exists because the application role holds no DELETE anywhere in `public`, so an item
 * a business is finished with is archived rather than removed, and it has to be reachable.
 *
 * A `counted` tab would belong to the stock count flow, which is a separate ticket and a separate
 * screen. Nothing here asks for it.
 *
 * The predicate lives here rather than in the query so that the tab counts and the visible rows
 * cannot disagree about what "Running low" means. The server counts with SQL for speed;
 * `inventory.test.ts` asserts the two agree.
 */
import { isBelowReorderPoint } from './stock';
import type { InventoryListItem } from './types';

export const INVENTORY_FILTERS = ['all', 'low', 'archived'] as const;

export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export function isInventoryFilter(value: unknown): value is InventoryFilter {
	return typeof value === 'string' && (INVENTORY_FILTERS as readonly string[]).includes(value);
}

const LABELS: Readonly<Record<InventoryFilter, string>> = Object.freeze({
	all: 'All',
	low: 'Running low',
	archived: 'Archived'
});

export function filterLabel(filter: InventoryFilter): string {
	return LABELS[filter];
}

/**
 * Does this row belong under that tab?
 *
 * An archived item appears under `archived` and nowhere else — not under `all`, and not under
 * `low` even if its quantity is beneath its reorder point. A business that has archived an item
 * has said it no longer stocks it, and "3 running low" would be a lie if one of the three were
 * something nobody intends to reorder.
 */
export function matchesFilter(filter: InventoryFilter, row: InventoryListItem): boolean {
	const archived = row.item.archivedAt !== null;

	switch (filter) {
		case 'all':
			return !archived;
		case 'low':
			return !archived && isBelowReorderPoint(row.item, row.onHand);
		case 'archived':
			return archived;
	}
}

/**
 * WHAT THE TABLE CAN BE SORTED BY.
 *
 * Four columns, because those are the four questions somebody asks of a list of stock: what is
 * it, how much is there, when do I need to reorder, and where is it. Sorting by the running-low
 * state is deliberately absent — that is what the `low` tab is, and a sort that reproduced a
 * filter would be two controls for one answer.
 *
 * In the URL rather than in a rune, so a sorted list can be bookmarked, shared and reloaded, and
 * the back button does what it looks like it does.
 */
export const INVENTORY_SORTS = ['name', 'onHand', 'reorderPoint', 'location'] as const;

export type InventorySort = (typeof INVENTORY_SORTS)[number];

export function isInventorySort(value: unknown): value is InventorySort {
	return typeof value === 'string' && (INVENTORY_SORTS as readonly string[]).includes(value);
}

export type SortDirection = 'asc' | 'desc';

export function isSortDirection(value: unknown): value is SortDirection {
	return value === 'asc' || value === 'desc';
}

/**
 * The direction a column starts in when somebody first clicks it.
 *
 * Every column here opens ASCENDING — which is where this diverges from invoicing, where dates
 * and amounts open descending. "Biggest first" is what a person means by sorting money; "least
 * first" is what they mean by sorting stock, because the interesting end of a stock list is the
 * empty end. Names and places open alphabetically, which is ascending too.
 *
 * A function rather than a constant because the day one column wants the other default, this is
 * where that lives — and because the route reads better calling it than inlining a string.
 */
export function defaultDirection(): SortDirection {
	return 'asc';
}
