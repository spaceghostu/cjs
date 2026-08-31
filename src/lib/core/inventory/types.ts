/**
 * WHAT INVENTORY IS, on both sides of the network.
 *
 * Client-safe, like Quoting's and Invoicing's models and for the same reason: the quantity a
 * screen shows and the quantity a count compares against come out of the same pure functions, so
 * the two cannot drift. Nothing here touches the database, `$lib/server`, or the DOM.
 *
 * THE ONE RULE THIS MODULE IS BUILT AROUND
 * ----------------------------------------
 * Quantity on hand is a SUM OF MOVEMENTS. There is no writable level, anywhere, at any layer —
 * `inventory_level` is a view over `inventory_movement`, and the type below has no constructor
 * that would let a screen invent one. T23 states the reason in one sentence: "a directly-writable
 * quantity column is how stock silently diverges from its own history."
 *
 * That is why `InventoryLevel` is a derived shape rather than a stored one, and why every
 * movement carries a reason: the ledger for physical things has to explain itself, or "materials
 * came from Inventory at the price you paid" is an assertion rather than a proof.
 */
import type { Money, Quantity, UnitPrice } from '$lib/core/money';
import type { CalendarDate } from '$lib/core/calendar';

/**
 * WHY A QUANTITY CHANGED.
 *
 * T23 names four — a count adjustment, a quote or invoice consuming stock, a purchase, a manual
 * correction — and this list splits "consuming" into its two documents, because the detail screen
 * has to say *which*, and adds one T23 does not.
 *
 * THE SPELLING IS NOT ARBITRARY. `quote`, `invoice` and `stock_count` are the words this platform
 * already uses for these three things — `DOCUMENT_TYPES` in `db/schema/core.ts` and
 * `POSTING_SOURCES` in `db/schema/ledger.ts` both spell them exactly so. A movement caused by a
 * count and the ledger entry that count posts should share one word, or a person joining the two
 * has to know a translation table that exists for no reason.
 *
 * `opening` is the one addition, and it is what makes creating an item honest. A new item that
 * starts at 40 boards needs a row explaining where 40 came from; without one, the first quantity
 * an item ever has is the only number in the system with no history behind it — precisely the
 * hole an append-only ledger exists to close. It is distinct from `correction`: nothing was
 * wrong, there was simply nothing before.
 *
 * `quote` and `invoice` are RESERVED — nothing writes them yet. The same discipline as
 * `credit_note` in `DOCUMENT_TYPES` and `stock_count` in `POSTING_SOURCES`, both of which sat
 * unused for a milestone before the code that needed them arrived.
 *
 * The database CHECK constraint is built from this list, so the stored vocabulary and the type
 * cannot disagree.
 */
export const MOVEMENT_REASONS = [
	'opening',
	'purchase',
	'stock_count',
	'quote',
	'invoice',
	'correction'
] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

export function isMovementReason(value: unknown): value is MovementReason {
	return typeof value === 'string' && (MOVEMENT_REASONS as readonly string[]).includes(value);
}

/**
 * SUGGESTIONS for the unit field, not a constraint.
 *
 * There is no CHECK behind this list, for the reason T23 gives about locations: a joinery's
 * board-metre and a cafe's punnet are the same concept, and a closed list would be wrong for one
 * of them on day one. The create form offers these through a `<datalist>` and accepts anything.
 */
export const COMMON_UNITS = [
	'each',
	'board',
	'sheet',
	'metre',
	'litre',
	'kg',
	'box',
	'roll'
] as const;

/**
 * THE FOUR STATES OF A STOCK COUNT.
 *
 * Stored, unlike an invoice's `overdue`, because a count's state is a fact about where a person
 * got to and not something derivable from a date. T24's promise — "nothing changes in your stock
 * until you've reviewed it at step 3" — is a statement about this column: everything before
 * `applied` has written no movement at all.
 */
export const STOCK_COUNT_STATUSES = ['preparing', 'counting', 'reviewing', 'applied'] as const;

export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number];

export function isStockCountStatus(value: unknown): value is StockCountStatus {
	return typeof value === 'string' && (STOCK_COUNT_STATUSES as readonly string[]).includes(value);
}

/**
 * A named place. "Rack A", "Bin 4", "Yard", "Cold room".
 *
 * Free-form per business rather than a fixed taxonomy, per T23: a joinery's yard and a cafe's
 * cold room are the same concept, and any list we wrote would be wrong for the third trade.
 */
export type InventoryLocation = {
	readonly id: string;
	readonly name: string;
	readonly archivedAt: Date | null;
};

/**
 * A thing the business keeps. "European oak, 40mm board".
 *
 * `costPrice` and `sellPrice` are both `UnitPrice` — millionths of a rand — because materials
 * priced per board-metre do not divide evenly into cents, which is the whole reason that type
 * exists. `reorderPoint` is a `Quantity` for the same reason: half a drum is a real reorder point.
 *
 * Storing the reorder point and acting on it are different things. T23 puts reorder automation
 * out of scope explicitly; this module surfaces the state and stops there.
 */
export type InventoryItem = {
	readonly id: string;
	readonly name: string;
	/** "board", "litre", "each" — the business's own word, printed next to every quantity. */
	readonly unitOfMeasure: string;
	/**
	 * NULLABLE, both of them. "We have not recorded what this costs" is a real state, and it is
	 * not zero — `Blank.svelte` is explicit that rendering an absent value as `R0` is simply a
	 * lie. The margin panel already degrades honestly rather than guessing at a cost (T21); this
	 * is the column that lets it.
	 */
	readonly costPrice: UnitPrice | null;
	readonly sellPrice: UnitPrice | null;
	/**
	 * NOT nullable, and zero means "never tell me". One fewer null to thread through every
	 * comparison, and the semantics fall out for free: nothing is strictly below zero, so a
	 * zero point is silent — except when stock goes NEGATIVE, which is a real problem and
	 * should be flagged.
	 */
	readonly reorderPoint: Quantity;
	/** Where this item normally lives. Nullable — an item can exist before anyone has decided. */
	readonly defaultLocationId: string | null;
	readonly archivedAt: Date | null;
};

/**
 * An item as the QUOTE EDITOR's picker is offered it. Client-safe, like everything here.
 *
 * The subset of `InventoryItem` a pick actually snapshots, plus the `sku` a person searches
 * by. `sellPrice` is a `UnitPrice | null` for the same reason the full type's is — "we have
 * not recorded what this sells for" is a real state and not zero, and the picker leaves the
 * price field for the person to type.
 *
 * DELIBERATELY no `description`: a pick copies nothing onto the client-facing document
 * (`lineFromItem` in quoting's core says why), so the picker has no business carrying it.
 */
export type PickableItem = {
	readonly id: string;
	readonly name: string;
	readonly sku: string | null;
	readonly unitOfMeasure: string;
	readonly sellPrice: UnitPrice | null;
};

/**
 * One change to one item in one place. Append-only, at the database as well as here.
 *
 * `qty` is SIGNED: stock arriving is positive, stock leaving is negative. One column rather than
 * a direction plus a magnitude, because a sum is then just a sum — and because a direction column
 * is a second thing that can disagree with the number beside it.
 *
 * `occurredAt` is when it happened; `createdAt` is when it was typed. They differ whenever
 * somebody records a correction after the fact, and the history reads on the former.
 */
export type InventoryMovement = {
	readonly id: string;
	readonly itemId: string;
	readonly locationId: string;
	readonly qty: Quantity;
	readonly reason: MovementReason;
	/** The person's own words on a `correction`, and the document number on a consumption. */
	readonly note: string | null;
	readonly occurredAt: Date;
	readonly createdAt: Date;
};

/**
 * Quantity on hand, per item per location. DERIVED — see the file header.
 *
 * There is no `id`, because there is no row: this is what `sum(qty_e6) GROUP BY item, location`
 * produces. An item with no movements has no level at all, which is why every consumer treats a
 * missing level as a real zero rather than as missing data.
 */
export type InventoryLevel = {
	readonly itemId: string;
	readonly locationId: string;
	readonly qty: Quantity;
	readonly lastMovedAt: Date | null;
};

/**
 * An item as the list screen needs it: the item, where it is, and how much of it there is.
 *
 * `placeCount` counts the locations actually holding some, so the screen can say "Rack A · and
 * one other place" rather than implying an item is only ever in one. A rack an item was moved out
 * of entirely is not somewhere it is.
 */
export type InventoryListItem = {
	readonly item: InventoryItem;
	readonly onHand: Quantity;
	readonly locationName: string | null;
	readonly placeCount: number;
	readonly lastMovedOn: CalendarDate | null;
};

/**
 * A staged count. Nothing here has moved any stock until `status` reaches `applied`.
 *
 * `appliedAt` and `appliedBy` are null until then, and they are the only record of who committed
 * a change to every quantity in the business — which is worth an actor of its own.
 */
export type StockCount = {
	readonly id: string;
	readonly number: string | null;
	readonly status: StockCountStatus;
	readonly period: CalendarDate;
	readonly startedAt: Date;
	readonly startedBy: string;
	readonly appliedAt: Date | null;
	readonly appliedBy: string | null;
};

/**
 * One line of a count.
 *
 * `expected` is SNAPSHOTTED at preparation, not read live. T23 is explicit about why: stock
 * moving during a count would otherwise silently change what the counter is comparing against,
 * and the person holding the clipboard would be blamed for the difference.
 *
 * `counted` is NULLABLE, and that null is load-bearing. "Not yet counted" and "counted zero" are
 * different facts — one is an empty row on a clipboard, the other is an empty shelf — and T24
 * gives them different renderings for exactly that reason.
 *
 * `costPrice` is snapshotted too, so the value effect a person approved at review is the value
 * effect that gets applied, even if somebody repriced the item in between.
 */
export type StockCountLine = {
	readonly id: string;
	readonly itemId: string;
	readonly locationId: string;
	readonly expected: Quantity;
	readonly counted: Quantity | null;
	/** Null when the item had no recorded cost. The line then has no value effect to state. */
	readonly costPrice: UnitPrice | null;
};

/**
 * A counted line with its arithmetic done. `difference` and `valueEffect` are always derived.
 *
 * `valueEffect` is null exactly when the line's cost was, and the review step says so rather than
 * folding an unknown into the total as a zero.
 */
export type CountedLine = {
	readonly line: StockCountLine;
	readonly difference: Quantity;
	readonly valueEffect: Money | null;
};
