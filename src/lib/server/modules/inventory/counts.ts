/**
 * STOCK COUNTS — the staged, resumable flow, server side.
 *
 * SPA-7 builds the four-step screen. This file is what that screen will call, and it lands here
 * rather than there because SPA-5's acceptance criteria are statements about the TRANSACTION, not
 * about the interface:
 *
 *   - "Applying a count is atomic — all movements or none."
 *   - "A count in any state before `applied` has changed no stock level."
 *   - "The design's worked line reproduces: expected 18, counted 14, difference -4, -R7 120."
 *
 * None of those can be proven by a stepper. They are proven by `applyCount` and the tests beside
 * it, against a real Postgres.
 *
 * THE PROMISE THE WHOLE FLOW MAKES — "nothing changes in your stock until you've reviewed it at
 * step 3" — is kept in three places at once, deliberately: by this module never writing a
 * movement before `applyCount`, by `app.freeze_count_snapshot()` refusing to let an expected
 * quantity drift mid-count, and by `app.freeze_applied_count()` refusing to let an applied count
 * be run twice. A promise held in only one of the three is a promise held until somebody writes a
 * second caller.
 */
import { eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '$lib/server/core/ctx';
import {
	inventoryLevel,
	item,
	stockCount,
	stockCountLine
} from '$lib/server/core/db/schema/inventory';
import { allocateDocumentNumber } from '$lib/server/core/db/numbering';
import { todayIn, type CalendarDate } from '$lib/core/calendar';
import { ZAR, type Money } from '$lib/core/money';
import { netValueEffect, varyingLines, type StockCountLine } from '$lib/core/inventory';
import { CannotDoThat, recordMovement } from './effects';
import { loadStockCount, loadStockCountLines } from './queries';

/**
 * PREPARE — take the snapshot.
 *
 * Every live item, in the place it is actually held, with the quantity we believe it has and the
 * cost it carries TODAY. All four are frozen from this moment: `app.freeze_count_snapshot()`
 * refuses to let any of them change while the count is open.
 *
 * T23 is explicit about why the expected quantity is snapshotted rather than read live: stock
 * moving during a count would otherwise silently change what the counter is comparing against,
 * and the person holding the clipboard gets blamed for the difference.
 *
 * The number is allocated here, in this transaction. An invoice peeks at its number instead,
 * because a burnt `INV-1043` is a gap an accountant will ask about; `SC-0001` is internal and
 * nobody outside the business ever sees it.
 */
export async function prepareCount(
	tx: Tx,
	businessId: string,
	userId: string | null,
	period: { start: CalendarDate; end: CalendarDate }
): Promise<string> {
	if (period.end < period.start) {
		throw new CannotDoThat('A stock count period has to end after it starts.');
	}

	const number = await allocateDocumentNumber(tx, 'stock_count');
	const countId = randomUUID();

	await tx.insert(stockCount).values({
		id: countId,
		businessId,
		numberPrefix: number.prefix,
		numberValue: number.value,
		numberFormatted: number.formatted,
		periodStart: period.start,
		periodEnd: period.end,
		status: 'preparing',
		startedByUserId: userId
	});

	// One line per item per place it is actually held. An item with no movements anywhere has no
	// level row, so it gets one line at its default location — you still have to go and look at
	// a shelf you believe is empty, and "we thought there were none" is a real expectation to
	// count against.
	//
	// KNOWN GAP, FOR SPA-7 TO DECIDE ON: an item with no movements AND no default location gets
	// no line at all, because there is nowhere to tell somebody to go and look. It falls silently
	// out of the count. That is defensible — an item nobody has placed anywhere is not yet stock —
	// but the count screen should probably say so rather than letting it vanish, and the fix
	// belongs with the screen that can show it.
	const held = await tx
		.select({
			itemId: inventoryLevel.itemId,
			locationId: inventoryLevel.locationId,
			qtyE6: inventoryLevel.qtyE6,
			costMicros: item.costMicros,
			currency: item.currency,
			name: item.name
		})
		.from(inventoryLevel)
		.innerJoin(item, eq(item.id, inventoryLevel.itemId))
		.where(isNull(item.archivedAt))
		.orderBy(item.name);

	const never = await tx
		.select({
			itemId: item.id,
			locationId: item.defaultLocationId,
			costMicros: item.costMicros,
			currency: item.currency,
			name: item.name
		})
		.from(item)
		.where(
			sql`${item.archivedAt} is null
			    and ${item.defaultLocationId} is not null
			    and not exists (
			        select 1 from inventory_level lv where lv.item_id = ${item.id}
			    )`
		)
		.orderBy(item.name);

	const rows = [
		...held.map((r) => ({
			itemId: r.itemId,
			locationId: r.locationId,
			expectedQtyE6: Number(r.qtyE6),
			costMicros: r.costMicros,
			currency: r.currency,
			name: r.name
		})),
		...never.map((r) => ({
			itemId: r.itemId,
			locationId: r.locationId as string,
			expectedQtyE6: 0,
			costMicros: r.costMicros,
			currency: r.currency,
			name: r.name
		}))
	].sort((a, b) => a.name.localeCompare(b.name));

	if (rows.length > 0) {
		await tx.insert(stockCountLine).values(
			rows.map((row, position) => ({
				businessId,
				stockCountId: countId,
				itemId: row.itemId,
				locationId: row.locationId,
				position,
				expectedQtyE6: row.expectedQtyE6,
				unitCostMicros: row.costMicros,
				currency: row.currency
			}))
		);
	}

	// Only now does the sheet close. Adding a line after this is refused at the database.
	await tx.update(stockCount).set({ status: 'counting' }).where(eq(stockCount.id, countId));

	return countId;
}

/**
 * COUNT — what somebody found on the shelf.
 *
 * `counted` and `countedAt` move together, enforced by a CHECK as well as here, so a line can
 * never claim a quantity nobody can date.
 *
 * Passing `null` un-counts a line, and that is deliberate: a counter who typed 14 into the wrong
 * row needs to be able to say "actually, I have not looked at this one yet". Without it the only
 * way back would be a zero, which is a different and much worse claim.
 */
export async function saveCountLine(
	tx: Tx,
	lineId: string,
	countedQtyE6: number | null,
	userId: string | null,
	now: Date = new Date()
): Promise<void> {
	if (countedQtyE6 !== null && countedQtyE6 < 0) {
		throw new CannotDoThat('Nobody counts a negative number of things onto a shelf.');
	}

	const updated = await tx
		.update(stockCountLine)
		.set({
			countedQtyE6,
			countedAt: countedQtyE6 === null ? null : now,
			countedByUserId: countedQtyE6 === null ? null : userId
		})
		.where(eq(stockCountLine.id, lineId))
		.returning({ id: stockCountLine.id });

	if (updated.length === 0) throw new CannotDoThat("We couldn't find that count line.");
}

export type CountReview = {
	readonly countId: string;
	readonly numberFormatted: string;
	readonly counted: number;
	readonly total: number;
	readonly changes: number;
	readonly net: Money;
	readonly uncosted: number;
};

/** Convert query rows into the pure model, so the arithmetic is the tested one. */
function toDomainLines(rows: Awaited<ReturnType<typeof loadStockCountLines>>): StockCountLine[] {
	return rows.map((row) => ({
		id: row.id,
		itemId: row.itemId,
		locationId: row.locationId,
		expected: row.expected,
		counted: row.counted,
		costPrice: row.costPrice
	}));
}

/**
 * REVIEW — exactly what will change, and what it is worth. The last point of return.
 *
 * Reads through the same pure functions the screen does, so the figure in the sticky footer and
 * the figure on the review step cannot disagree — T24 makes that an acceptance criterion, and one
 * shared function is the only way to keep it true.
 */
export async function reviewCount(tx: Tx, countId: string): Promise<CountReview> {
	const header = await loadStockCount(tx, countId);
	if (!header) throw new CannotDoThat("We couldn't find that stock count.");

	const rows = await loadStockCountLines(tx, countId);
	const lines = toDomainLines(rows);
	const { net, uncosted } = netValueEffect(ZAR, lines);

	return {
		countId,
		numberFormatted: header.numberFormatted,
		counted: lines.filter((l) => l.counted !== null).length,
		total: lines.length,
		changes: varyingLines(lines).length,
		net,
		uncosted
	};
}

/**
 * APPLY — one movement per varying line, all of them or none.
 *
 * ATOMICITY IS NOT ARRANGED HERE; IT IS INHERITED. Everything below runs inside the caller's
 * `Tx`, which is one Postgres transaction — so a failure on the fortieth line rolls back the
 * thirty-nine before it without this function knowing how. That is the whole reason `withModule`
 * hands out a transaction rather than a connection, and why this function must never open one of
 * its own or swallow an error to "salvage" the rest.
 *
 * A LINE THAT MATCHED WRITES NOTHING. So does an uncounted one — "not yet counted" is not a
 * finding, and treating it as one would post every unvisited rack as a total loss. An
 * all-matching count therefore applies cleanly and moves nothing, which is exactly right: it
 * happened, it is recorded, and it changed nothing.
 *
 * The status transition to `applied` is the last statement, so every trigger that fires on it
 * sees the movements already written.
 */
export async function applyCount(
	tx: Tx,
	businessId: string,
	countId: string,
	userId: string | null,
	now: Date = new Date()
): Promise<{ movements: number; net: Money }> {
	const header = await loadStockCount(tx, countId);
	if (!header) throw new CannotDoThat("We couldn't find that stock count.");

	if (header.status === 'applied') {
		throw new CannotDoThat('That stock count has already been applied to your stock.');
	}
	if (header.status === 'preparing') {
		throw new CannotDoThat('That stock count is still being prepared.');
	}

	const rows = await loadStockCountLines(tx, countId);
	const byId = new Map(rows.map((row) => [row.id, row]));
	const varying = varyingLines(toDomainLines(rows));

	const occurredOn = todayIn(now);

	for (const settled of varying) {
		const row = byId.get(settled.line.id);
		if (!row) continue;

		const movementId = await recordMovement(tx, businessId, userId, {
			itemId: row.itemId,
			locationId: row.locationId,
			qtyE6: settled.difference.e6,
			reason: 'stock_count',
			// The count names itself, so a movement can always explain where it came from — and
			// `inventory_movement_source_shape` refuses the row if it does not.
			sourceId: countId,
			sourceRef: header.numberFormatted,
			unitCostMicros: row.costPrice?.micros ?? null,
			note: null,
			occurredOn
		});

		// The line points back at what it caused, so the count is auditable in both directions.
		await tx
			.update(stockCountLine)
			.set({ movementId })
			.where(eq(stockCountLine.id, settled.line.id));
	}

	const { net } = netValueEffect(ZAR, toDomainLines(rows));

	await tx
		.update(stockCount)
		.set({ status: 'applied', appliedAt: now, appliedByUserId: userId })
		.where(eq(stockCount.id, countId));

	return { movements: varying.length, net };
}
