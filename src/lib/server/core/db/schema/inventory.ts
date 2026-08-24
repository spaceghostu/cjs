/**
 * INVENTORY — the ledger for physical things.
 *
 * Invoicing's tables exist because an invoice is a tax record. These exist because a quantity is
 * a CLAIM, and the only thing that makes a claim checkable is the history behind it. T23 states
 * the rule in one sentence, and every decision in this file follows from it:
 *
 *   > A directly-writable quantity column is how stock silently diverges from its own history.
 *
 * WHAT THAT MEANS, CONCRETELY
 * ---------------------------
 *  1. THERE IS NO LEVEL TABLE. `inventory_level` at the bottom of this file is a VIEW —
 *     `sum(qty_e6) GROUP BY item, location` over `inventory_movement`. Not a table maintained by
 *     a trigger, which would be a second copy of the truth and therefore something that can
 *     disagree with the first. A view containing `GROUP BY` is not auto-updatable in Postgres, so
 *     "cannot be written directly" is enforced by the server itself rather than by a trigger
 *     somebody could drop. Nothing can diverge from a `sum()`.
 *
 *  2. A MOVEMENT IS APPEND-ONLY. DELETE is already revoked everywhere in `public` by
 *     `0003_platform.sql`; `app.refuse_movement_change()` in `0008_inventory.sql` takes UPDATE
 *     away too. A ledger you can edit is a list, and "materials came from Inventory at the price
 *     you paid" stops being provable.
 *
 *  3. QUANTITY IS SIGNED, IN ONE COLUMN. `+6` arrived, `-4` left. Not a magnitude beside a
 *     direction column — one signed integer makes "what is on hand" a single SUM, exactly as a
 *     signed posting makes "does it balance" a single SUM in `ledger.ts`. A direction column is a
 *     second thing that can contradict the number next to it.
 *
 *  4. A COUNT COMMITS NOTHING UNTIL IT IS APPLIED. `expected_qty_e6` is snapshotted at
 *     preparation and frozen; `counted_qty_e6` is NULLABLE because "not yet" and "counted zero"
 *     are different facts about the world. Applying writes movements — it never writes a level,
 *     because there is no level to write.
 *
 * WHY THE STOCK COUNT TABLES ARE `inventory_`-PREFIXED, when the ticket says `stock_count`: every
 * table in this database is namespaced by its owner, and `schema.ts` exists so that one `cat`
 * answers "what tables are there". A bare `stock_count` is the one row nobody can place. The
 * STRING `'stock_count'` in `DOCUMENT_TYPES` and `POSTING_SOURCES` is untouched — that names a
 * document type, not a table.
 */
import { sql } from 'drizzle-orm';
import {
	check,
	date,
	index,
	integer,
	pgTable,
	pgView,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { MOVEMENT_REASONS, STOCK_COUNT_STATUSES } from '$lib/core/inventory';
import { businessId, exactRange, id, micros, notBlank, oneOf, qtyE6, timestamps } from '../base';
import { business } from './core';

/**
 * A named place. "Rack A", "Bin 4", "Yard", "Cold room".
 *
 * Free-form per business rather than a fixed taxonomy, per T23: a joinery's yard and a cafe's
 * cold room are the same concept, and any list we wrote would be wrong for the third trade.
 *
 * Unique on `(business_id, name)`, because two "Rack A"s would make "where is it" ambiguous on
 * every row that answered with one.
 */
export const location = pgTable(
	'inventory_location',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		name: text().notNull(),

		/** "Behind the finishing room, top two shelves" — where a person actually looks. */
		note: text(),

		/** Removal is an UPDATE. The application role holds no DELETE anywhere in `public`. */
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		notBlank('inventory_location_name_present', t.name),
		unique('inventory_location_name_unique').on(t.businessId, t.name),
		index('inventory_location_business_name_idx').on(t.businessId, t.name)
	]
);

/**
 * A thing the business keeps. "European oak, 40mm board".
 *
 * COST AND SELL ARE NULLABLE, and that is deliberate. "We have not recorded what this costs" is a
 * real state and it is NOT zero — `Blank.svelte` is explicit that rendering an absent value as
 * `R0` is simply a lie, and T21 requires the margin panel to degrade honestly rather than guess
 * at a cost. These are the columns that let it.
 *
 * THE REORDER POINT IS NOT NULLABLE, and zero means "never tell me". One fewer null to thread
 * through every comparison, and the semantics fall out for free: nothing is strictly below zero,
 * so a zero point is silent — except when stock has gone NEGATIVE, which is a real problem and
 * ought to be flagged.
 *
 * `(id, currency)` is unique so movements and count lines can carry a COMPOSITE foreign key to
 * it. `money/types.ts` names this as the thing that makes a mixed-currency document a database
 * error rather than a silently wrong total.
 */
export const item = pgTable(
	'inventory_item',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		name: text().notNull(),

		/** The business's own code. Never generated — a business that has one already has one. */
		sku: text(),

		description: text(),

		/**
		 * "board", "litre", "each" — the business's own word, printed beside every quantity.
		 *
		 * FREE TEXT, for the reason T23 gives about locations. A joinery's board-metre and a
		 * cafe's punnet are the same concept, and a closed list is wrong for one of them on day
		 * one. `COMMON_UNITS` in `$lib/core/inventory` is a suggestion list, not a constraint.
		 */
		unit: text().notNull().default('each'),

		/** Millionths of a rand. R1 780/board -> 1_780_000_000. Nullable — see the header. */
		costMicros: micros('cost_micros'),
		sellMicros: micros('sell_micros'),
		currency: text().notNull().default('ZAR'),

		/** Millionths of a unit. Zero means "never tell me" — see the header. */
		reorderPointE6: qtyE6('reorder_point_e6').notNull().default(0),

		/** Where it NORMALLY lives — not where it is. Where it is comes from the movements. */
		defaultLocationId: uuid().references(() => location.id, { onDelete: 'restrict' }),

		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		notBlank('inventory_item_name_present', t.name),
		notBlank('inventory_item_unit_present', t.unit),
		oneOf('inventory_item_currency_supported', t.currency, ['ZAR']),

		// The composite-FK anchor. See the header, and `invoicing.ts` for the same line.
		unique('inventory_item_id_currency').on(t.id, t.currency),
		// NULLs are distinct in Postgres, so this constrains real SKUs and ignores absent ones.
		unique('inventory_item_sku_unique').on(t.businessId, t.sku),

		exactRange('inventory_item_cost_exact', t.costMicros),
		exactRange('inventory_item_sell_exact', t.sellMicros),
		exactRange('inventory_item_reorder_point_exact', t.reorderPointE6),

		// A negative PRICE is meaningless, unlike a negative quantity. Stock going out is a real
		// event; paying negative rand for a board is a typo.
		check('inventory_item_cost_not_negative', sql`${t.costMicros} is null or ${t.costMicros} >= 0`),
		check('inventory_item_sell_not_negative', sql`${t.sellMicros} is null or ${t.sellMicros} >= 0`),
		check('inventory_item_reorder_not_negative', sql`${t.reorderPointE6} >= 0`),

		index('inventory_item_business_name_idx').on(t.businessId, t.name),
		index('inventory_item_business_location_idx').on(t.businessId, t.defaultLocationId)
	]
);

/**
 * ONE CHANGE TO ONE ITEM IN ONE PLACE. Append-only — see the file header.
 *
 * This is the whole truth about quantity. `inventory_level` is a view over it, the item detail
 * screen reads it directly, and applying a stock count writes one row here per varying line and
 * nothing else.
 *
 * `source_id` IS NOT A FOREIGN KEY, for the reason `quoting.ts:375-384` gives about
 * `source_item_id`: a movement must survive the document that caused it, and the module that
 * owns that document being removed. `source_ref` carries `INV-1042` so the history can say where
 * four boards went without reaching into Invoicing at all.
 *
 * `occurred_on` is the day the stock actually moved; `created_at` is when somebody typed it. They
 * differ whenever a correction is recorded after the fact, and the history reads on the former —
 * a backdated correction belongs where it happened, not where it was entered.
 */
export const movement = pgTable(
	'inventory_movement',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		/** Composite FK to `inventory_item (id, currency)`, written by hand in the migration. */
		itemId: uuid().notNull(),
		locationId: uuid()
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),

		/** Millionths of a unit, SIGNED. See the file header. */
		qtyE6: qtyE6('qty_e6').notNull(),

		reason: text().notNull(),

		/** The document that caused it, if one did. Not a foreign key — see the header. */
		sourceId: uuid(),
		sourceRef: text(),

		/**
		 * What one of these cost AT THIS MOMENT.
		 *
		 * Snapshotted rather than read from the item, because the item's cost is today's answer
		 * and this row is about a day that has passed. Nullable: "nobody recorded a cost" is a
		 * first-class answer, and it is the one the margin panel degrades on.
		 */
		unitCostMicros: micros('unit_cost_micros'),
		currency: text().notNull().default('ZAR'),

		occurredOn: date().notNull(),

		/** Who did it. Attribution comes from the session, the same as the audit trigger's. */
		recordedByUserId: text(),

		/** The person's own words on a correction. Required for one — see `0008`'s CHECK. */
		note: text(),

		...timestamps()
	},
	(t) => [
		oneOf('inventory_movement_reason_known', t.reason, MOVEMENT_REASONS),
		oneOf('inventory_movement_currency_supported', t.currency, ['ZAR']),

		exactRange('inventory_movement_qty_exact', t.qtyE6),
		exactRange('inventory_movement_cost_exact', t.unitCostMicros),

		// A movement of nothing records nothing. Note this is `<> 0`, NOT `>= 0` — a movement is
		// a delta, and half of them are negative by construction.
		check('inventory_movement_qty_not_zero', sql`${t.qtyE6} <> 0`),
		check(
			'inventory_movement_cost_not_negative',
			sql`${t.unitCostMicros} is null or ${t.unitCostMicros} >= 0`
		),

		// A movement caused by a document names the document, or the history cannot explain
		// itself. `opening`, `purchase` and `correction` have no document and say so.
		check(
			'inventory_movement_source_shape',
			sql`${t.reason} not in ('quote', 'invoice', 'stock_count') or ${t.sourceId} is not null`
		),

		// The two queries this table exists for: the level (grouped) and one item's history.
		index('inventory_movement_level_idx').on(t.businessId, t.itemId, t.locationId),
		index('inventory_movement_history_idx').on(t.businessId, t.itemId, t.occurredOn, t.createdAt),
		index('inventory_movement_source_idx').on(t.businessId, t.reason, t.sourceId)
	]
);

/**
 * A STAGED COUNT. Nothing here has moved any stock until `status` reaches `applied`.
 *
 * T24's promise — "nothing changes in your stock until you've reviewed it at step 3" — is a
 * statement about this column, and `app.freeze_applied_count()` in `0008` is what makes it true
 * of the database rather than only of the interface.
 *
 * THE NUMBER IS ALLOCATED AT CREATION, not peeked at. An invoice peeks because a burnt `INV-1043`
 * is a gap an accountant will ask about; `SC-0007` is internal and nobody outside the business
 * ever sees it. `numbering.ts` already carries the `SC` entry, `start: 1, pad: 4`.
 */
export const stockCount = pgTable(
	'inventory_stock_count',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		numberPrefix: text().notNull(),
		numberValue: integer().notNull(),
		numberFormatted: text().notNull(),

		/** "Stock count · July" is a period, not a day. */
		periodStart: date().notNull(),
		periodEnd: date().notNull(),

		status: text().notNull().default('preparing'),

		startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		startedByUserId: text(),

		/** The only record of who committed a change to every quantity in the business. */
		appliedAt: timestamp({ withTimezone: true }),
		appliedByUserId: text(),

		note: text(),
		archivedAt: timestamp({ withTimezone: true }),

		...timestamps()
	},
	(t) => [
		oneOf('inventory_stock_count_status_known', t.status, STOCK_COUNT_STATUSES),
		notBlank('inventory_stock_count_prefix_present', t.numberPrefix),
		unique('inventory_stock_count_number_unique').on(t.businessId, t.numberFormatted),

		check('inventory_stock_count_period_ordered', sql`${t.periodEnd} >= ${t.periodStart}`),

		// The status and its evidence move together. Mirrors `invoicing_invoice_paid_has_date`:
		// an `applied` count with no `applied_at` would be a change nobody can date.
		check(
			'inventory_stock_count_applied_has_date',
			sql`(${t.status} = 'applied') = (${t.appliedAt} is not null)`
		),

		index('inventory_stock_count_business_status_idx').on(t.businessId, t.status, t.startedAt)
	]
);

/**
 * ONE LINE OF A COUNT.
 *
 * `expected_qty_e6` is SNAPSHOTTED at preparation and frozen there. T23 is explicit about why:
 * stock moving during a count would otherwise silently change what the counter is comparing
 * against, and the person holding the clipboard gets blamed for the difference.
 *
 * `counted_qty_e6` IS NULLABLE, and that null is load-bearing. "Not yet counted" and "counted
 * zero" are different facts — one is an empty row on a clipboard, the other is an empty shelf —
 * and T24 gives them different renderings for exactly that reason: `not yet` in a DASHED border,
 * which reads as awaiting input rather than as a value.
 *
 * `unit_cost_micros` is snapshotted too, so the value effect a person approved at review is the
 * value effect that gets applied, even if somebody repriced the item in between.
 *
 * THE DIFFERENCE AND THE VALUE EFFECT ARE NOT STORED. Both are derived by
 * `$lib/core/inventory/stock.ts`, for the reason `invoicing.ts:350-353` gives about line totals:
 * what is stored is a quantity and a unit price, and a second copy of the arithmetic is a second
 * thing that can disagree. A generated column could express the difference but not the value
 * effect — `roundDiv` rounds half away from zero and has no SQL expression that does not
 * reintroduce `numeric`, which is import-banned in schema files.
 */
export const stockCountLine = pgTable(
	'inventory_stock_count_line',
	{
		id: id(),
		businessId: businessId().references(() => business.businessId, { onDelete: 'restrict' }),

		stockCountId: uuid()
			.notNull()
			.references(() => stockCount.id, { onDelete: 'restrict' }),

		/** Composite FK to `inventory_item (id, currency)`, written by hand in the migration. */
		itemId: uuid().notNull(),
		locationId: uuid()
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),

		position: integer().notNull().default(0),

		/** WHAT WE THOUGHT, at preparation. Never re-read. Frozen once the count leaves preparing. */
		expectedQtyE6: qtyE6('expected_qty_e6').notNull(),

		/** WHAT SOMEBODY COUNTED. Nullable — see the header. */
		countedQtyE6: qtyE6('counted_qty_e6'),
		countedAt: timestamp({ withTimezone: true }),
		countedByUserId: text(),

		unitCostMicros: micros('unit_cost_micros'),
		currency: text().notNull().default('ZAR'),

		note: text(),

		/** The movement this line produced when the count was applied. Null until then. */
		movementId: uuid().references(() => movement.id, { onDelete: 'restrict' }),

		...timestamps()
	},
	(t) => [
		oneOf('inventory_stock_count_line_currency_supported', t.currency, ['ZAR']),

		exactRange('inventory_stock_count_line_expected_exact', t.expectedQtyE6),
		exactRange('inventory_stock_count_line_counted_exact', t.countedQtyE6),
		exactRange('inventory_stock_count_line_cost_exact', t.unitCostMicros),

		// A counted quantity cannot be negative — nobody counts minus four boards onto a shelf.
		// EXPECTED is deliberately unconstrained: movements can legitimately net below zero, and
		// refusing to snapshot that would make the one case most worth counting uncountable.
		check(
			'inventory_stock_count_line_counted_not_negative',
			sql`${t.countedQtyE6} is null or ${t.countedQtyE6} >= 0`
		),
		// "Counted" and "when it was counted" arrive together or not at all, so a line can never
		// claim a quantity nobody can date.
		check(
			'inventory_stock_count_line_counted_complete',
			sql`(${t.countedQtyE6} is null) = (${t.countedAt} is null)`
		),
		check(
			'inventory_stock_count_line_cost_not_negative',
			sql`${t.unitCostMicros} is null or ${t.unitCostMicros} >= 0`
		),

		// Two lines for the same item in the same place would double its variance.
		unique('inventory_stock_count_line_unique').on(t.stockCountId, t.itemId, t.locationId),
		index('inventory_stock_count_line_count_idx').on(t.stockCountId, t.position)
	]
);

/**
 * QUANTITY ON HAND — A VIEW, so there is nothing to write.
 *
 * Created by hand in `0008_inventory.sql` with `security_invoker = true`, which is load-bearing:
 * without it the view would execute as its OWNER — the DDL role, which `FORCE ROW LEVEL SECURITY`
 * does not constrain — and every business would read every other's stock levels while the screen
 * looked perfect. `scripts/invariants.sql` filters on `relkind IN ('r','p')` and so never examines
 * a view, which means the usual safety net is absent exactly here. `inventory.test.ts` asserts the
 * isolation directly instead.
 *
 * `.existing()` tells drizzle-kit this relation is managed elsewhere. WITHOUT IT, the next
 * `db:generate` — possibly for an unrelated module, months from now — emits `DROP VIEW`. After
 * any migration touching this schema, run `db:generate` a second time and confirm it reports no
 * changes.
 *
 * `sum(qty_e6)` returns `bigint`, which node-postgres hands back as a STRING. `toQuantity` goes
 * through `exactInteger`, which accepts `string | number | bigint` — `map.ts:14` names a view as
 * exactly the case it was written defensively for.
 */
export const inventoryLevel = pgView('inventory_level', {
	businessId: uuid('business_id').notNull(),
	itemId: uuid('item_id').notNull(),
	locationId: uuid('location_id').notNull(),
	qtyE6: qtyE6('qty_e6').notNull(),
	lastMovedOn: date('last_moved_on'),
	lastRecordedAt: timestamp('last_recorded_at', { withTimezone: true })
}).existing();
