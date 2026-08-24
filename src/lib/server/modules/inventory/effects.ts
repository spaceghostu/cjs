/**
 * CHANGING INVENTORY.
 *
 * Every function here writes, and every one of them writes through a `Tx` that `withModule`
 * already scoped and entitled. There is one rule the whole file is arranged around:
 *
 *   NOTHING WRITES A QUANTITY. Quantities are written as MOVEMENTS, and read back as the sum of
 *   them. `inventory_level` is a view; there is no level to set, and no function here that could
 *   set one if somebody wanted to.
 *
 * That is why creating an item with an opening quantity writes an `opening` movement rather than
 * a starting number, and why correcting a mistake writes a `correction` movement rather than
 * editing the movement that was wrong. The database enforces both — `app.refuse_movement_change`
 * refuses the edit — but the shape of this module is what makes doing it right the easy path.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '$lib/server/core/ctx';
import { item, location, movement } from '$lib/server/core/db/schema/inventory';
import { todayIn, type CalendarDate } from '$lib/core/calendar';
import { isMovementReason, type MovementReason } from '$lib/core/inventory';

/**
 * Something the person asked for that the module will not do, with a sentence they can act on.
 *
 * Thrown, not returned. A `fail()` returned from inside `withModule` is just what the callback
 * resolves to — the action would ignore it and report success having written nothing at all.
 * `invoicing/effects.ts` learned this the same way.
 */
export class CannotDoThat extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CannotDoThat';
	}
}

export type ItemInput = {
	readonly name: string;
	readonly sku: string | null;
	readonly description: string | null;
	readonly unit: string;
	readonly costMicros: number | null;
	readonly sellMicros: number | null;
	readonly reorderPointE6: number;
	readonly defaultLocationId: string | null;
	/** A location the person typed rather than picked. Created in the same transaction. */
	readonly newLocationName: string | null;
};

/**
 * FIND OR CREATE THE PLACE.
 *
 * Locations are free-form per business (T23), so a first item must not require visiting a
 * settings screen that does not exist. Matched case-insensitively on the name, because a person
 * who typed "rack a" meant the "Rack A" they already have, and two rows differing only in case
 * would make "where is it" ambiguous on every row that answered with one.
 */
export async function resolveLocation(
	tx: Tx,
	businessId: string,
	locationId: string | null,
	newName: string | null
): Promise<string | null> {
	if (locationId) return locationId;

	const name = newName?.trim();
	if (!name) return null;

	const [existing] = await tx
		.select({ id: location.id })
		.from(location)
		.where(sql`lower(${location.name}) = lower(${name})`);

	if (existing) return existing.id;

	const id = randomUUID();
	await tx.insert(location).values({ id, businessId, name });
	return id;
}

/**
 * Create an item, and — if the business said how much of it they have — the one movement that
 * explains where that quantity came from.
 *
 * The opening quantity is NOT a level. It is an `opening` movement, dated today, which is the
 * only honest answer to "where did 40 boards come from" on an item that did not exist a moment
 * ago. Without it, the first quantity an item ever has would be the one number in the system
 * with no history behind it.
 */
export async function createItem(
	tx: Tx,
	businessId: string,
	userId: string | null,
	input: ItemInput,
	opening: { qtyE6: number; locationId: string | null } | null = null,
	now: Date = new Date()
): Promise<string> {
	const name = input.name.trim();
	if (!name) throw new CannotDoThat('An item needs a name before it can be saved.');

	const unit = input.unit.trim() || 'each';
	const locationId = await resolveLocation(
		tx,
		businessId,
		input.defaultLocationId,
		input.newLocationName
	);

	const id = randomUUID();

	await tx.insert(item).values({
		id,
		businessId,
		name,
		sku: input.sku?.trim() || null,
		description: input.description?.trim() || null,
		unit,
		costMicros: input.costMicros,
		sellMicros: input.sellMicros,
		reorderPointE6: input.reorderPointE6,
		defaultLocationId: locationId
	});

	if (opening && opening.qtyE6 !== 0) {
		const where = opening.locationId ?? locationId;
		if (!where) {
			throw new CannotDoThat(
				'Say where this stock is kept, and we can record how much of it you have.'
			);
		}

		await recordMovement(tx, businessId, userId, {
			itemId: id,
			locationId: where,
			qtyE6: opening.qtyE6,
			reason: 'opening',
			note: null,
			unitCostMicros: input.costMicros,
			occurredOn: todayIn(now)
		});
	}

	return id;
}

/**
 * Edit an item's details. NOT its quantity — there is no quantity here to edit.
 *
 * Changing the cost price is deliberately allowed and deliberately NOT retrospective: movements
 * already recorded keep the cost they snapshotted, so repricing an item today does not silently
 * restate what last month's stock count was worth.
 */
export async function updateItem(
	tx: Tx,
	businessId: string,
	itemId: string,
	input: ItemInput
): Promise<void> {
	const name = input.name.trim();
	if (!name) throw new CannotDoThat('An item needs a name before it can be saved.');

	const locationId = await resolveLocation(
		tx,
		businessId,
		input.defaultLocationId,
		input.newLocationName
	);

	const updated = await tx
		.update(item)
		.set({
			name,
			sku: input.sku?.trim() || null,
			description: input.description?.trim() || null,
			unit: input.unit.trim() || 'each',
			costMicros: input.costMicros,
			sellMicros: input.sellMicros,
			reorderPointE6: input.reorderPointE6,
			defaultLocationId: locationId
		})
		.where(eq(item.id, itemId))
		.returning({ id: item.id });

	if (updated.length === 0) throw new CannotDoThat("We couldn't find that item.");
}

/**
 * Archive an item. Not delete — the application role holds no DELETE anywhere in `public`, and
 * an item's movements are the history of stock the business really had.
 *
 * An archived item keeps every movement it ever had and stops appearing in the list, in the
 * running-low count and in the valuation. It is reversible, which is why the screen does not
 * warn about it.
 */
export async function archiveItem(tx: Tx, itemId: string, now: Date = new Date()): Promise<void> {
	const updated = await tx
		.update(item)
		.set({ archivedAt: now })
		.where(and(eq(item.id, itemId), isNull(item.archivedAt)))
		.returning({ id: item.id });

	if (updated.length === 0) {
		throw new CannotDoThat("We couldn't find that item, or it is already archived.");
	}
}

export async function restoreItem(tx: Tx, itemId: string): Promise<void> {
	const updated = await tx
		.update(item)
		.set({ archivedAt: null })
		.where(eq(item.id, itemId))
		.returning({ id: item.id });

	if (updated.length === 0) throw new CannotDoThat("We couldn't find that item.");
}

export type MovementInput = {
	readonly itemId: string;
	readonly locationId: string;
	/** Millionths of a unit, SIGNED. Negative is stock leaving. */
	readonly qtyE6: number;
	readonly reason: MovementReason;
	readonly note: string | null;
	readonly unitCostMicros?: number | null;
	readonly sourceId?: string | null;
	readonly sourceRef?: string | null;
	readonly occurredOn: CalendarDate;
};

/**
 * THE ONLY WAY A QUANTITY CHANGES.
 *
 * Everything that moves stock comes through here — creating an item with an opening balance,
 * applying a stock count, and (later) an invoice consuming materials. One function, so there is
 * one place where "a quantity changed" is written and one place to look when asking why.
 *
 * A CORRECTION MUST SAY WHY. The other reasons carry their own explanation — an opening balance
 * is self-evident, a count adjustment points at the count, an invoice points at the invoice — but
 * `correction` is a person overriding the arithmetic, and a stock ledger where a number can move
 * for no stated reason is a ledger nobody can rely on.
 */
export async function recordMovement(
	tx: Tx,
	businessId: string,
	userId: string | null,
	input: MovementInput
): Promise<string> {
	if (!isMovementReason(input.reason)) {
		throw new CannotDoThat('That is not a reason stock can move.');
	}

	if (input.qtyE6 === 0) {
		throw new CannotDoThat('A change of nothing is not a change. Enter how much moved.');
	}

	const note = input.note?.trim() || null;
	if (input.reason === 'correction' && !note) {
		throw new CannotDoThat('Say what you are correcting, so the history explains itself later.');
	}

	const id = randomUUID();

	await tx.insert(movement).values({
		id,
		businessId,
		itemId: input.itemId,
		locationId: input.locationId,
		qtyE6: input.qtyE6,
		reason: input.reason,
		sourceId: input.sourceId ?? null,
		sourceRef: input.sourceRef ?? null,
		unitCostMicros: input.unitCostMicros ?? null,
		occurredOn: input.occurredOn,
		recordedByUserId: userId,
		note
	});

	return id;
}
