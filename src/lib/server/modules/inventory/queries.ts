/**
 * READING INVENTORY.
 *
 * Every function here takes a `Tx` and no `businessId`. The tables are tenant tables, so
 * `tenant_isolation` has already decided whose rows these are — passing a business id would be a
 * second answer to a question the database has answered, and the day the two disagreed the
 * database would win silently.
 *
 * QUANTITY COMES FROM `inventory_level`, WHICH IS A VIEW. There is no level column to read and no
 * level row to trust; the view is `sum(qty_e6)` over the movements. That is why every join to it
 * is a LEFT join: an item nobody has ever moved has no row in the view at all, and its quantity
 * is a real zero rather than missing data.
 *
 * EVERY QUERY IS BOUNDED. T20 made that an acceptance criterion for invoicing in words that apply
 * unchanged here — "an unbounded query is a defect waiting for a successful customer" — and a
 * business with three thousand parts is a better outcome than one with thirty.
 */
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Tx } from '$lib/server/core/ctx';
import {
	inventoryLevel,
	item,
	location,
	movement,
	stockCount,
	stockCountLine
} from '$lib/server/core/db/schema/inventory';
import { toQuantity, toQuantityOrNull, toUnitPriceOrNull } from '$lib/server/core/db/map';
import type { CalendarDate } from '$lib/core/calendar';
import { ZAR, lineAmount, sumMoney, type Money, type Quantity } from '$lib/core/money';
import type {
	InventoryFilter,
	InventoryItem,
	InventoryListItem,
	InventorySort,
	MovementReason,
	SortDirection,
	StockCountStatus
} from '$lib/core/inventory';

export const DEFAULT_PAGE_SIZE = 25;

/** A ceiling on what one request can ask for. An export asks for more, and is still bounded. */
export const MAX_PAGE_SIZE = 500;

/**
 * One item as the list screen needs it.
 *
 * `onHand` is summed across every location; `locationName` names where it normally lives and
 * `placeCount` says how many places actually hold some, so the screen can say "Rack A · and one
 * other place" rather than implying an item is only ever in one.
 */
export type ItemPage = {
	readonly items: readonly InventoryListItem[];
	readonly total: number;
	readonly page: number;
	readonly pageSize: number;
};

/**
 * Quantity on hand per item, rolled up from the per-location view.
 *
 * `placeCount` counts only the locations holding a non-zero quantity — a rack an item was moved
 * out of entirely is not somewhere it is.
 */
function levelsByItem(tx: Tx) {
	return tx
		.select({
			itemId: inventoryLevel.itemId,
			qtyE6: sql<string>`sum(${inventoryLevel.qtyE6})`.as('qty_e6'),
			placeCount: sql<number>`count(*) filter (where ${inventoryLevel.qtyE6} <> 0)::int`.as(
				'place_count'
			),
			lastMovedOn: sql<string | null>`max(${inventoryLevel.lastMovedOn})`.as('last_moved_on')
		})
		.from(inventoryLevel)
		.groupBy(inventoryLevel.itemId)
		.as('lv');
}

/**
 * THE ONE SQL DEFINITION OF "RUNNING LOW", and it mirrors `isBelowReorderPoint` in
 * `$lib/core/inventory/stock.ts` exactly — STRICTLY below, with a missing level read as zero.
 *
 * Two definitions of the same predicate is how a tab that says `Running low 3` ends up listing
 * four rows. `inventory.test.ts` asserts the two agree, including at the boundary.
 */
function lowPredicate(levels: ReturnType<typeof levelsByItem>) {
	return sql`coalesce(${levels.qtyE6}, 0) < ${item.reorderPointE6}`;
}

function orderFor(
	sort: InventorySort,
	direction: SortDirection,
	levels: ReturnType<typeof levelsByItem>
) {
	const dir = direction === 'desc' ? desc : asc;

	const primary = {
		name: dir(item.name),
		onHand: dir(sql`coalesce(${levels.qtyE6}, 0)`),
		reorderPoint: dir(item.reorderPointE6),
		location: dir(location.name)
	}[sort];

	// ALWAYS a tie-break. Without one, two items with the same name — or the same quantity, which
	// is far more common — can swap places between two pages of the same list, showing one twice
	// and skipping another. It gets reported as "an item disappeared".
	return [primary, asc(item.id)];
}

export async function listItems(
	tx: Tx,
	options: {
		filter?: InventoryFilter;
		sort?: InventorySort;
		direction?: SortDirection;
		search?: string;
		page?: number;
		pageSize?: number;
	} = {}
): Promise<ItemPage> {
	const {
		filter = 'all',
		sort = 'name',
		direction = 'asc',
		search = '',
		page = 1,
		pageSize = DEFAULT_PAGE_SIZE
	} = options;

	const size = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
	const levels = levelsByItem(tx);

	const term = search.trim();
	const where = and(
		filter === 'archived' ? isNotNull(item.archivedAt) : isNull(item.archivedAt),
		filter === 'low' ? lowPredicate(levels) : undefined,
		term ? or(ilike(item.name, `%${term}%`), ilike(item.sku, `%${term}%`)) : undefined
	);

	const [{ total }] = await tx
		.select({ total: count() })
		.from(item)
		.leftJoin(levels, eq(levels.itemId, item.id))
		.where(where);

	const rows = await tx
		.select({
			id: item.id,
			name: item.name,
			sku: item.sku,
			unit: item.unit,
			costMicros: item.costMicros,
			currency: item.currency,
			reorderPointE6: item.reorderPointE6,
			archivedAt: item.archivedAt,
			locationName: location.name,
			qtyE6: sql<string | null>`${levels.qtyE6}`,
			placeCount: sql<number>`coalesce(${levels.placeCount}, 0)`,
			lastMovedOn: sql<string | null>`${levels.lastMovedOn}`
		})
		.from(item)
		.leftJoin(levels, eq(levels.itemId, item.id))
		.leftJoin(location, eq(location.id, item.defaultLocationId))
		.where(where)
		.orderBy(...orderFor(sort, direction, levels))
		.limit(size)
		.offset((Math.max(1, page) - 1) * size);

	return {
		items: rows.map((row) => ({
			item: {
				id: row.id,
				name: row.name,
				unitOfMeasure: row.unit,
				costPrice: toUnitPriceOrNull(row.costMicros, row.currency),
				sellPrice: null,
				reorderPoint: toQuantity(row.reorderPointE6),
				defaultLocationId: null,
				archivedAt: row.archivedAt
			},
			// A missing level is a real zero — see the file header.
			onHand: toQuantity(row.qtyE6 ?? 0),
			locationName: row.locationName,
			placeCount: row.placeCount,
			lastMovedOn: row.lastMovedOn
		})),
		total,
		page: Math.max(1, page),
		pageSize: size
	};
}

export type InventoryCounts = Readonly<Record<InventoryFilter, number>>;

/**
 * THE TAB COUNTS — `All 48 · Running low 3 · Archived 2`.
 *
 * One query with FILTER clauses, like `countInvoices`. Every count is produced even when zero,
 * because `Running low 0` is stated rather than hidden: it is the number an owner most wants
 * confirmed, and hiding it would make it appear only as bad news.
 */
export async function countItems(tx: Tx): Promise<InventoryCounts> {
	const levels = levelsByItem(tx);

	const [row] = await tx
		.select({
			all: sql<number>`count(*) filter (where ${item.archivedAt} is null)::int`,
			low: sql<number>`count(*) filter (where ${item.archivedAt} is null and ${lowPredicate(levels)})::int`,
			archived: sql<number>`count(*) filter (where ${item.archivedAt} is not null)::int`
		})
		.from(item)
		.leftJoin(levels, eq(levels.itemId, item.id));

	return { all: row.all, low: row.low, archived: row.archived };
}

/**
 * WHAT HOME SAYS ABOUT STOCK — the counts, and enough names to say which.
 *
 * `homeStandingCopy` needs three things: how many items there are, how many are under their reorder
 * point, and the names of the first couple — because SPA-8 is specific that the concern names what
 * is low rather than saying "check your stock".
 *
 * ONE STATEMENT, NOT TWO. The count and the names have to agree, and `lowNamesSentence` derives its
 * "and 2 others" by subtracting the names it shows from the count it was given. Two statements in
 * one READ COMMITTED transaction get two snapshots, so a movement landing between them would
 * produce "European oak and one other" for four low items. One aggregate cannot disagree with
 * itself.
 *
 * The slice is `[1:2]` because `lowNamesSentence` shows at most two — see the note there about a
 * 12px line that stops being a glance once it wraps. `array_agg ... filter` returns NULL rather
 * than an empty array when nothing matches, hence the `coalesce`.
 */
export type StockStanding = {
	readonly itemCount: number;
	readonly lowCount: number;
	/** At most two, alphabetical. The rest of the answer is `lowCount`. */
	readonly lowNames: readonly string[];
};

export async function stockStanding(tx: Tx): Promise<StockStanding> {
	const levels = levelsByItem(tx);
	const low = sql`${item.archivedAt} is null and ${lowPredicate(levels)}`;

	const [row] = await tx
		.select({
			itemCount: sql<number>`count(*) filter (where ${item.archivedAt} is null)::int`,
			lowCount: sql<number>`count(*) filter (where ${low})::int`,
			// Alphabetical rather than furthest-below, so the two names a returning owner reads are
			// the two they read yesterday. This panel's argument is that the eye lands where it did.
			lowNames: sql<
				string[]
			>`coalesce((array_agg(${item.name} order by ${item.name}) filter (where ${low}))[1:2], '{}'::text[])`
		})
		.from(item)
		.leftJoin(levels, eq(levels.itemId, item.id));

	return { itemCount: row.itemCount, lowCount: row.lowCount, lowNames: row.lowNames };
}

/**
 * THE SUMMARY BAR — "48 items · 3 running low · R412 000 at cost".
 *
 * `valueAtCost` is computed per item and then summed, rather than summed and then rounded once.
 * The two differ by up to half a cent per row, and a total that does not equal the sum of the
 * rows a person can see is a support ticket. `summarise` in invoicing takes the same trade for
 * the same reason.
 *
 * `uncosted` is returned rather than swallowed. An item with no recorded cost contributes nothing
 * to the valuation, and a figure that quietly omitted it while presenting itself as complete
 * would be understating what the business owns. The screen states the count beside the figure.
 */
export type InventorySummary = {
	readonly itemCount: number;
	readonly lowCount: number;
	readonly locationCount: number;
	readonly valueAtCost: Money;
	readonly uncosted: number;
};

export async function summarise(tx: Tx): Promise<InventorySummary> {
	const levels = levelsByItem(tx);

	const [rows, [locations]] = await Promise.all([
		tx
			.select({
				costMicros: item.costMicros,
				currency: item.currency,
				reorderPointE6: item.reorderPointE6,
				qtyE6: sql<string | null>`${levels.qtyE6}`
			})
			.from(item)
			.leftJoin(levels, eq(levels.itemId, item.id))
			.where(isNull(item.archivedAt))
			.limit(MAX_PAGE_SIZE),
		tx.select({ total: count() }).from(location).where(isNull(location.archivedAt))
	]);

	const costed = rows.filter((r) => r.costMicros !== null);

	const valueAtCost = sumMoney(
		ZAR,
		costed.map((r) =>
			lineAmount(toUnitPriceOrNull(r.costMicros, r.currency)!, toQuantity(r.qtyE6 ?? 0))
		)
	);

	return {
		itemCount: rows.length,
		lowCount: rows.filter((r) => Number(r.qtyE6 ?? 0) < Number(r.reorderPointE6)).length,
		locationCount: locations.total,
		valueAtCost,
		uncosted: rows.length - costed.length
	};
}

/** One item, in full, for the detail screen. */
export type ItemDetailRow = {
	readonly item: InventoryItem;
	readonly sku: string | null;
	readonly description: string | null;
	readonly onHand: Quantity;
	readonly locationName: string | null;
	readonly placeCount: number;
	readonly lastMovedOn: CalendarDate | null;
};

export async function loadItem(tx: Tx, itemId: string): Promise<ItemDetailRow | null> {
	const levels = levelsByItem(tx);

	const [row] = await tx
		.select({
			id: item.id,
			name: item.name,
			sku: item.sku,
			description: item.description,
			unit: item.unit,
			costMicros: item.costMicros,
			sellMicros: item.sellMicros,
			currency: item.currency,
			reorderPointE6: item.reorderPointE6,
			defaultLocationId: item.defaultLocationId,
			archivedAt: item.archivedAt,
			locationName: location.name,
			qtyE6: sql<string | null>`${levels.qtyE6}`,
			placeCount: sql<number>`coalesce(${levels.placeCount}, 0)`,
			lastMovedOn: sql<string | null>`${levels.lastMovedOn}`
		})
		.from(item)
		.leftJoin(levels, eq(levels.itemId, item.id))
		.leftJoin(location, eq(location.id, item.defaultLocationId))
		.where(eq(item.id, itemId));

	// RLS has already made "another business's item" and "no such item" the same answer.
	if (!row) return null;

	return {
		item: {
			id: row.id,
			name: row.name,
			unitOfMeasure: row.unit,
			costPrice: toUnitPriceOrNull(row.costMicros, row.currency),
			sellPrice: toUnitPriceOrNull(row.sellMicros, row.currency),
			reorderPoint: toQuantity(row.reorderPointE6),
			defaultLocationId: row.defaultLocationId,
			archivedAt: row.archivedAt
		},
		sku: row.sku,
		description: row.description,
		onHand: toQuantity(row.qtyE6 ?? 0),
		locationName: row.locationName,
		placeCount: row.placeCount,
		lastMovedOn: row.lastMovedOn
	};
}

/** Where one item actually is, a row per place. Straight from the view. */
export type ItemLevelRow = {
	readonly locationId: string;
	readonly locationName: string;
	readonly onHand: Quantity;
	readonly lastMovedOn: CalendarDate | null;
};

export async function levelsForItem(tx: Tx, itemId: string): Promise<ItemLevelRow[]> {
	const rows = await tx
		.select({
			locationId: inventoryLevel.locationId,
			locationName: location.name,
			qtyE6: inventoryLevel.qtyE6,
			lastMovedOn: inventoryLevel.lastMovedOn
		})
		.from(inventoryLevel)
		.innerJoin(location, eq(location.id, inventoryLevel.locationId))
		.where(eq(inventoryLevel.itemId, itemId))
		.orderBy(asc(location.name))
		.limit(MAX_PAGE_SIZE);

	return rows.map((row) => ({
		locationId: row.locationId,
		locationName: row.locationName,
		onHand: toQuantity(row.qtyE6),
		lastMovedOn: row.lastMovedOn
	}));
}

/**
 * THE HISTORY — what happened, in order, with a reason on every row.
 *
 * `balanceAfter` is a running total computed by a window function BEFORE the page is cut, so page
 * two's balances are still the real ones rather than a sum of what happens to be visible. It is
 * what makes the history read as a ledger, and it is the on-screen proof of SPA-6's "quantities
 * are read from movements, never from a writable level": the newest row's balance IS the level,
 * and `inventory.test.ts` asserts that equality.
 *
 * Ordered on `occurred_on`, not `created_at` — a backdated correction belongs where it happened,
 * not where it was typed.
 */
export type MovementRow = {
	readonly id: string;
	readonly locationName: string;
	readonly qty: Quantity;
	readonly reason: MovementReason;
	readonly sourceRef: string | null;
	readonly note: string | null;
	readonly unitCost: ReturnType<typeof toUnitPriceOrNull>;
	readonly balanceAfter: Quantity;
	readonly occurredOn: CalendarDate;
	readonly recordedByUserId: string | null;
};

export type MovementPage = {
	readonly movements: readonly MovementRow[];
	readonly total: number;
	readonly page: number;
	readonly pageSize: number;
};

export async function listMovements(
	tx: Tx,
	itemId: string,
	options: { page?: number; pageSize?: number } = {}
): Promise<MovementPage> {
	const { page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;
	const size = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);

	const [{ total }] = await tx
		.select({ total: count() })
		.from(movement)
		.where(eq(movement.itemId, itemId));

	const running = tx
		.select({
			id: movement.id,
			locationId: movement.locationId,
			qtyE6: movement.qtyE6,
			reason: movement.reason,
			sourceRef: movement.sourceRef,
			note: movement.note,
			unitCostMicros: movement.unitCostMicros,
			currency: movement.currency,
			occurredOn: movement.occurredOn,
			recordedByUserId: movement.recordedByUserId,
			createdAt: movement.createdAt,
			balanceE6: sql<string>`sum(${movement.qtyE6}) over (
				order by ${movement.occurredOn}, ${movement.createdAt}, ${movement.id}
				rows between unbounded preceding and current row
			)`.as('balance_e6')
		})
		.from(movement)
		.where(eq(movement.itemId, itemId))
		.as('mv');

	const rows = await tx
		.select({
			id: running.id,
			locationName: location.name,
			qtyE6: running.qtyE6,
			reason: running.reason,
			sourceRef: running.sourceRef,
			note: running.note,
			unitCostMicros: running.unitCostMicros,
			currency: running.currency,
			balanceE6: running.balanceE6,
			occurredOn: running.occurredOn,
			recordedByUserId: running.recordedByUserId
		})
		.from(running)
		.innerJoin(location, eq(location.id, running.locationId))
		.orderBy(desc(running.occurredOn), desc(running.createdAt), desc(running.id))
		.limit(size)
		.offset((Math.max(1, page) - 1) * size);

	return {
		movements: rows.map((row) => ({
			id: row.id,
			locationName: row.locationName,
			qty: toQuantity(row.qtyE6),
			reason: row.reason as MovementReason,
			sourceRef: row.sourceRef,
			note: row.note,
			unitCost: toUnitPriceOrNull(row.unitCostMicros, row.currency),
			balanceAfter: toQuantity(row.balanceE6),
			occurredOn: row.occurredOn,
			recordedByUserId: row.recordedByUserId
		})),
		total,
		page: Math.max(1, page),
		pageSize: size
	};
}

/** The places this business keeps things. Needed by every form that asks "where". */
export type LocationRow = { readonly id: string; readonly name: string };

export async function listLocations(tx: Tx): Promise<LocationRow[]> {
	return tx
		.select({ id: location.id, name: location.name })
		.from(location)
		.where(isNull(location.archivedAt))
		.orderBy(asc(location.name))
		.limit(MAX_PAGE_SIZE);
}

/** A count and its lines, for the apply transaction and for SPA-7's screens later. */
export type StockCountRow = {
	readonly id: string;
	readonly numberFormatted: string;
	readonly status: StockCountStatus;
	readonly periodStart: CalendarDate;
	readonly periodEnd: CalendarDate;
};

export async function loadStockCount(tx: Tx, countId: string): Promise<StockCountRow | null> {
	const [row] = await tx
		.select({
			id: stockCount.id,
			numberFormatted: stockCount.numberFormatted,
			status: stockCount.status,
			periodStart: stockCount.periodStart,
			periodEnd: stockCount.periodEnd
		})
		.from(stockCount)
		.where(eq(stockCount.id, countId));

	if (!row) return null;
	return { ...row, status: row.status as StockCountStatus };
}

/**
 * THE COUNT SOMEBODY LEFT PART-FINISHED, and how far in they were.
 *
 * `counting` and `reviewing` only. `applied` is finished and frozen. `preparing` is not a resting
 * state at all — `prepareCount` inserts at `preparing` and flips to `counting` in the same
 * transaction, so a row still sitting there is the wreckage of a rolled-back attempt rather than
 * anybody's half-done work.
 *
 * ORDERED ON `startedAt`, NOT `updatedAt`. Counting an item updates the LINE, and the touch
 * trigger for the header only fires when the header itself changes — so a count worked on all
 * afternoon has the `updatedAt` it was created with. `updatedAt` would order these by when their
 * status last moved, which is very nearly the opposite of what the card claims. `id` breaks the
 * tie, per the note in `orderFor`.
 *
 * `counted` is lines with a quantity somebody recorded, which is what `countProgress` means by it
 * — the NULL is load-bearing, because "not counted yet" and "counted zero" are different facts.
 */
export type UnfinishedCountRow = {
	readonly id: string;
	readonly periodStart: CalendarDate;
	readonly periodEnd: CalendarDate;
	readonly counted: number;
	readonly total: number;
};

export async function unfinishedCount(tx: Tx): Promise<UnfinishedCountRow | null> {
	const [header] = await tx
		.select({
			id: stockCount.id,
			periodStart: stockCount.periodStart,
			periodEnd: stockCount.periodEnd
		})
		.from(stockCount)
		.where(
			and(
				isNull(stockCount.archivedAt),
				inArray(stockCount.status, ['counting', 'reviewing'] satisfies StockCountStatus[])
			)
		)
		.orderBy(desc(stockCount.startedAt), desc(stockCount.id))
		.limit(1);

	if (!header) return null;

	// One aggregate, and only for the count that will actually be shown.
	const [progress] = await tx
		.select({
			total: sql<number>`count(*)::int`,
			counted: sql<number>`count(${stockCountLine.countedQtyE6})::int`
		})
		.from(stockCountLine)
		.where(eq(stockCountLine.stockCountId, header.id));

	return { ...header, counted: progress.counted, total: progress.total };
}

export type StockCountLineRow = {
	readonly id: string;
	readonly itemId: string;
	readonly itemName: string;
	readonly locationId: string;
	readonly locationName: string;
	readonly expected: Quantity;
	readonly counted: Quantity | null;
	readonly costPrice: ReturnType<typeof toUnitPriceOrNull>;
	readonly movementId: string | null;
};

export async function loadStockCountLines(tx: Tx, countId: string): Promise<StockCountLineRow[]> {
	const rows = await tx
		.select({
			id: stockCountLine.id,
			itemId: stockCountLine.itemId,
			itemName: item.name,
			locationId: stockCountLine.locationId,
			locationName: location.name,
			expectedQtyE6: stockCountLine.expectedQtyE6,
			countedQtyE6: stockCountLine.countedQtyE6,
			unitCostMicros: stockCountLine.unitCostMicros,
			currency: stockCountLine.currency,
			movementId: stockCountLine.movementId
		})
		.from(stockCountLine)
		.innerJoin(item, eq(item.id, stockCountLine.itemId))
		.innerJoin(location, eq(location.id, stockCountLine.locationId))
		.where(eq(stockCountLine.stockCountId, countId))
		.orderBy(asc(stockCountLine.position), asc(item.name))
		.limit(MAX_PAGE_SIZE);

	return rows.map((row) => ({
		id: row.id,
		itemId: row.itemId,
		itemName: row.itemName,
		locationId: row.locationId,
		locationName: row.locationName,
		expected: toQuantity(row.expectedQtyE6),
		counted: toQuantityOrNull(row.countedQtyE6),
		costPrice: toUnitPriceOrNull(row.unitCostMicros, row.currency),
		movementId: row.movementId
	}));
}
