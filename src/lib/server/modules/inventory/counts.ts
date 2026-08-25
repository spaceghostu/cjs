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
import {
	netValueEffect,
	varyingLines,
	type StockCountLine,
	type StockCountStatus
} from '$lib/core/inventory';
import { CannotDoThat, recordMovement } from './effects';
import { loadStockCount, loadStockCountLines, unfinishedCount } from './queries';

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
 * THE LOCK CLASS FOR "ONE OPEN STOCK COUNT PER BUSINESS".
 *
 * Postgres advisory locks are namespaced by a pair of 32-bit integers, and the first of the pair
 * is by convention a constant that says WHICH invariant is being held — so two unrelated locks in
 * this codebase can never collide by both happening to hash a business id. The number itself is
 * arbitrary and means nothing; what matters is that it is declared once, here, beside the only
 * function that takes it, and that the next such lock gets its own.
 */
const OPEN_COUNT_LOCK = 8_407;

/**
 * RESUME BEFORE PREPARE, AND HOLD THE DOOR WHILE YOU DECIDE.
 *
 * "Start a stock count" almost always means "get me back to mine". A count is long and
 * interruptible by design, so the entry point looks for an open one first and only snapshots a
 * new sheet when there is genuinely nothing to go back to.
 *
 * THE ORDERING IS NOT ENOUGH ON ITS OWN, and that is why this function exists rather than the
 * three lines it replaces. A check-then-act across two statements is a race: a double-click, or a
 * resubmit racing a second tab, sends two requests that each open their own transaction, each ask
 * "is there an open count?" before the other's INSERT has committed, and each get "no". Two live
 * counts, two burnt `SC-` numbers, and forty-eight orphaned lines behind Home's resume card,
 * which shows exactly one. No stock moves — nothing here writes a movement — but the invariant
 * the entry point claims out loud is broken, and the person is left with a count they cannot get
 * back to.
 *
 * SO THE SECOND CALLER WAITS. `pg_advisory_xact_lock` blocks until the first transaction ends,
 * at which point the second one's `unfinishedCount` can see the committed row and returns it.
 * The double-click gets the same count id as the click, which is what it wanted.
 *
 * WHY THIS AND NOT A PARTIAL UNIQUE INDEX. `unique (business_id) where status in ('counting',
 * 'reviewing')` would enforce the same thing at the floor, and in a schema this defensive that is
 * the more idiomatic answer — but it needs a migration, and a migration is a permanent addition
 * to a schema that already has three triggers guarding this table. This is a fix for a
 * double-click on one button. If a second way to start a count ever appears, the index earns its
 * migration; until then the lock is the smaller thing that closes the hole.
 *
 * WHY THE `xact` VARIANT AND NOT `pg_advisory_lock`. It is released when the transaction ends,
 * commit or rollback, by Postgres rather than by us. A session-scoped lock would need an unlock
 * in a `finally` that a crashed request never reaches, and a lock held by a dead connection is a
 * button nobody can press again.
 *
 * A `hashtext` COLLISION BETWEEN TWO BUSINESSES COSTS NOTHING BUT A WAIT. Two tenants hashing to
 * the same 32-bit key would serialise each other's "start a count" clicks for the length of one
 * transaction. That is the entire consequence: no row is shared, no row is visible, because RLS
 * decides what each transaction can see and a lock decides nothing at all about that.
 */
export async function resumeOrPrepareCount(
	tx: Tx,
	businessId: string,
	userId: string | null,
	period: { start: CalendarDate; end: CalendarDate }
): Promise<string> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(${OPEN_COUNT_LOCK}::int4, hashtext(${businessId}::text))`
	);

	const open = await unfinishedCount(tx);
	if (open) return open.id;

	return prepareCount(tx, businessId, userId, period);
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

/**
 * STEP 2 -> 3, AND BACK AGAIN.
 *
 * The two transitions that carry no data and change no quantity, and they live here rather than
 * in the route for one reason: this is the only file that writes `inventory_stock_count`. A route
 * that reached for the table directly would be the second place a count's status can move, and
 * the promise the whole flow makes is a statement about that column.
 *
 * THE GUARD IS NOT REDUNDANT WITH THE DATABASE'S. `app.freeze_applied_count()` permits
 * `counting -> applied` — its job is to stop a count being un-applied, not to know what a screen
 * looks like. "Nothing changes in your stock until you've reviewed it at step 3" is the
 * APPLICATION's promise, and the review step is where it is kept: the caller must pass through
 * `beginReview` before `applyCount` will be offered the count.
 *
 * ALREADY THERE IS NOT A FAILURE. A double-submit, a back button, a slow connection somebody
 * tapped twice — all of them arrive as "move to the state you are already in", and answering that
 * with an error would be the interface complaining about its own latency.
 */
async function moveTo(
	tx: Tx,
	countId: string,
	from: StockCountStatus,
	to: 'counting' | 'reviewing'
): Promise<void> {
	const header = await loadStockCount(tx, countId);
	if (!header) throw new CannotDoThat("We couldn't find that stock count.");

	if (header.status === 'applied') {
		throw new CannotDoThat('That stock count has already been applied to your stock.');
	}
	if (header.status === to) return;
	if (header.status !== from) {
		throw new CannotDoThat('That stock count is not at the step you are trying to move it from.');
	}

	await tx.update(stockCount).set({ status: to }).where(eq(stockCount.id, countId));
}

/** Stop counting and start deciding. The sheet becomes a list of what will change. */
export async function beginReview(tx: Tx, countId: string): Promise<void> {
	return moveTo(tx, countId, 'counting', 'reviewing');
}

/**
 * Go back for another look, which is the whole point of a last point of return.
 *
 * The database permits this transition explicitly — `reviewing -> counting`, with the comment
 * "going back for another look" beside it in `0008_inventory.sql`.
 */
export async function resumeCounting(tx: Tx, countId: string): Promise<void> {
	return moveTo(tx, countId, 'reviewing', 'counting');
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
