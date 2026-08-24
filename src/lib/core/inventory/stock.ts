/**
 * THE ARITHMETIC. Pure, exact, and the only place quantity-on-hand is worked out.
 *
 * Every function here takes movements or snapshots and returns a derived answer. None of them
 * reads a level, because there is no level to read — see `types.ts`. The server computes the
 * same sums in SQL for speed, and `inventory.test.ts` asserts the two agree, in the same way
 * `invoicing.test.ts` reconciles its filter predicate against its query.
 */
import {
	ZERO_QTY,
	cmpQty,
	isQtyZero,
	lineAmount,
	subQty,
	sumMoney,
	sumQty,
	type CurrencyCode,
	type Money,
	type Quantity,
	type UnitPrice
} from '$lib/core/money';
import type { CountedLine, InventoryItem, InventoryMovement, StockCountLine } from './types';

/**
 * Quantity on hand, from the movements themselves.
 *
 * An empty run sums to zero, and that zero is a real answer rather than an absence: an item
 * nobody has ever moved genuinely has none of it. The list screen depends on that — it LEFT
 * JOINs the level view, so an item with no movements arrives with no level, and this is the
 * function that decides what that means.
 */
export function onHand(movements: readonly InventoryMovement[]): Quantity {
	return sumQty(movements.map((m) => m.qty));
}

/** On hand in one place, rather than across all of them. */
export function onHandAt(movements: readonly InventoryMovement[], locationId: string): Quantity {
	return onHand(movements.filter((m) => m.locationId === locationId));
}

/**
 * IS THIS ITEM RUNNING LOW? — the module's one piece of genuine urgency.
 *
 * Strictly below, not at-or-below. A reorder point of 20 with 20 on hand is the amount the
 * business decided was enough; flagging it would make the reassurance "none running low"
 * unreachable for anyone who set their points to round numbers and hit one exactly.
 *
 * A reorder point of zero means "never tell me", and falls out of the same comparison for free.
 */
export function isBelowReorderPoint(item: InventoryItem, qty: Quantity): boolean {
	return cmpQty(qty, item.reorderPoint) < 0;
}

/**
 * What a count line differs by. Positive means more on the shelf than expected.
 *
 * An uncounted line differs by nothing — NOT by its whole expected quantity. "Not yet counted"
 * is not a finding, and letting it read as one would put every unvisited rack into the review
 * step as a total loss.
 */
export function difference(line: StockCountLine): Quantity {
	return line.counted === null ? ZERO_QTY : subQty(line.counted, line.expected);
}

/**
 * What a difference is worth: `difference x cost price at count time`, in `Money`.
 *
 * The design's worked line is the test: European oak expected 18, counted 14, difference -4, at
 * R1 780 a board, is -R7 120. `lineAmount` does the exactness — micros x e6 in BigInt, rounded
 * once — so a fractional quantity of a fractional price still lands on a whole cent.
 */
export function valueEffect(diff: Quantity, costPrice: UnitPrice | null): Money | null {
	return costPrice === null ? null : lineAmount(costPrice, diff);
}

/** A line with its arithmetic done, ready for the review step and for `applyCount`. */
export function settleLine(line: StockCountLine): CountedLine {
	const diff = difference(line);
	return { line, difference: diff, valueEffect: valueEffect(diff, line.costPrice) };
}

/**
 * The lines a count would actually change.
 *
 * Uncounted lines are excluded — they have no finding — and so are counted lines that matched.
 * `applyCount` writes one movement per row this returns and none for anything else, which is
 * what "one per varying line" means and why an all-matching count writes nothing at all.
 */
export function varyingLines(lines: readonly StockCountLine[]): CountedLine[] {
	return lines
		.filter((line) => line.counted !== null)
		.map(settleLine)
		.filter((settled) => !isQtyZero(settled.difference));
}

/**
 * What the whole count is worth, netted — and how much of it could not be valued.
 *
 * T24's footer states the net as one figure ("net effect on stock value -R8 000"), and the review
 * step has to show the same number the footer promised, so both read this.
 *
 * `uncosted` is returned rather than swallowed. A line whose item has no recorded cost contributes
 * nothing to the net, and a total that quietly omitted it while presenting itself as complete
 * would be the interface understating a loss. The screen states the count beside the figure.
 */
export function netValueEffect<C extends CurrencyCode>(
	currency: C,
	lines: readonly StockCountLine[]
): { net: Money<C>; uncosted: number } {
	const varying = varyingLines(lines);
	const known = varying.filter(
		(s): s is CountedLine & { valueEffect: Money } => s.valueEffect !== null
	);

	return {
		net: sumMoney(
			currency,
			known.map((settled) => settled.valueEffect as Money<C>)
		),
		uncosted: varying.length - known.length
	};
}

/** How far through a count somebody is. T24's footer: "47 of 48 counted". */
export function countProgress(lines: readonly StockCountLine[]): {
	counted: number;
	total: number;
} {
	return { counted: lines.filter((l) => l.counted !== null).length, total: lines.length };
}
