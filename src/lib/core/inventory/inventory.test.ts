/**
 * INVENTORY'S CORE, PROVEN.
 *
 * The pure half: what is on hand, what is running low, what a count line differs by and what that
 * difference is worth, and every word the screens say about it. Nothing here touches a database —
 * the guarantees that need Postgres are asserted in `modules/inventory/inventory.test.ts` and in
 * `db/schema/inventory.test.ts`.
 *
 * The value-effect block is deliberately the design's own worked example to the cent.
 */
import { describe, expect, it } from 'vitest';
import { quantity, unitPrice } from '$lib/core/money/ctor';
import { ZAR, formatZar, type Quantity } from '$lib/core/money';
import {
	countProgress,
	difference,
	isBelowReorderPoint,
	netValueEffect,
	onHand,
	onHandAt,
	varyingLines
} from './stock';
import { matchesFilter } from './filter';
import {
	emptyCopy,
	movementReasonCopy,
	standingSentence,
	stockCopy,
	summarySentence
} from './copy';
import type { InventoryItem, InventoryListItem, InventoryMovement, StockCountLine } from './types';

/**
 * `formatZar` separates thousands with a NON-BREAKING space, so an expectation written with an
 * ordinary one produces the worst failure message in testing: `expected 'R7 120,00' to be
 * 'R7 120,00'`. Same helper, same reason, as `core/invoicing/invoicing.test.ts`.
 */
const nb = (s: string) => s.replaceAll(' ', '\u00a0');

/** One board. Quantities are millionths of a unit, so a whole one is 1_000_000. */
const units = (n: number): Quantity => quantity(n * 1_000_000);

/** R1 780,00 per board, the design's own cost price for European oak. */
const OAK_COST = unitPrice(1_780_000_000, ZAR);

function item(over: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: 'item-oak',
		name: 'European oak, 40mm board',
		unitOfMeasure: 'board',
		costPrice: OAK_COST,
		sellPrice: unitPrice(2_400_000_000, ZAR),
		reorderPoint: units(12),
		defaultLocationId: 'loc-rack-a',
		archivedAt: null,
		...over
	};
}

function movement(over: Partial<InventoryMovement> = {}): InventoryMovement {
	return {
		id: 'mv-1',
		itemId: 'item-oak',
		locationId: 'loc-rack-a',
		qty: units(10),
		reason: 'purchase',
		note: null,
		occurredAt: new Date('2026-07-01T09:00:00Z'),
		createdAt: new Date('2026-07-01T09:00:00Z'),
		...over
	};
}

function line(over: Partial<StockCountLine> = {}): StockCountLine {
	return {
		id: 'line-1',
		itemId: 'item-oak',
		locationId: 'loc-rack-a',
		expected: units(18),
		counted: units(14),
		costPrice: OAK_COST,
		...over
	};
}

function row(over: Partial<InventoryListItem> = {}): InventoryListItem {
	return {
		item: item(),
		onHand: units(40),
		locationName: 'Rack A',
		placeCount: 1,
		lastMovedOn: '2026-07-01',
		...over
	};
}

describe('quantity on hand is a sum of movements', () => {
	it('adds signed movements', () => {
		const qty = onHand([
			movement({ qty: units(40), reason: 'opening' }),
			movement({ id: 'mv-2', qty: units(-4), reason: 'stock_count' }),
			movement({ id: 'mv-3', qty: units(6), reason: 'purchase' })
		]);
		expect(qty.e6).toBe(units(42).e6);
	});

	/**
	 * An item nobody has ever moved has NONE of it — not "unknown". The list LEFT JOINs the level
	 * view, so a missing level arrives here as an empty run, and this is the line that decides
	 * what that means.
	 */
	it('an item with no movements has a real zero, not an absence', () => {
		expect(onHand([]).e6).toBe(0);
	});

	/** Fractions are exactly why quantities are e6 and not floats. 2.5 + 0.1 + 0.1 is 2.7. */
	it('is exact across fractional quantities', () => {
		const qty = onHand([
			movement({ qty: quantity(2_500_000) }),
			movement({ id: 'mv-2', qty: quantity(100_000) }),
			movement({ id: 'mv-3', qty: quantity(100_000) })
		]);
		expect(qty.e6).toBe(2_700_000);
	});

	it('separates one location from another', () => {
		const movements = [
			movement({ qty: units(10), locationId: 'loc-rack-a' }),
			movement({ id: 'mv-2', qty: units(7), locationId: 'loc-yard' })
		];
		expect(onHandAt(movements, 'loc-rack-a').e6).toBe(units(10).e6);
		expect(onHandAt(movements, 'loc-yard').e6).toBe(units(7).e6);
		expect(onHand(movements).e6).toBe(units(17).e6);
	});
});

describe('running low', () => {
	it('is strictly below the reorder point', () => {
		expect(isBelowReorderPoint(item(), units(11))).toBe(true);
		expect(isBelowReorderPoint(item(), units(13))).toBe(false);
	});

	/**
	 * At the point exactly is NOT low. The reorder point is the amount the business decided was
	 * enough, and flagging it would put "none running low" out of reach for anyone who set round
	 * numbers and hit one.
	 */
	it('at the point exactly is not low', () => {
		expect(isBelowReorderPoint(item(), units(12))).toBe(false);
	});

	/** A reorder point of zero means "never tell me", and falls out of the same comparison. */
	it('a zero reorder point never reports low', () => {
		expect(isBelowReorderPoint(item({ reorderPoint: units(0) }), units(0))).toBe(false);
	});
});

describe("the design's worked count line", () => {
	/** T23: expected 18, counted 14, difference −4, value effect −R7 120 at R1 780 a board. */
	it('reproduces −4 and −R7 120', () => {
		const l = line();
		expect(difference(l).e6).toBe(units(-4).e6);

		const [settled] = varyingLines([l]);
		expect(settled.valueEffect).not.toBeNull();
		expect(settled.valueEffect?.cents).toBe(-712_000);
		expect(formatZar(settled.valueEffect!)).toBe(nb('-R7 120,00'));
	});

	/**
	 * An uncounted line differs by NOTHING — not by its whole expected quantity. "Not yet counted"
	 * is not a finding, and treating it as one would put every unvisited rack into the review step
	 * as a total loss.
	 */
	it('an uncounted line differs by nothing and is not a variance', () => {
		const l = line({ counted: null });
		expect(difference(l).e6).toBe(0);
		expect(varyingLines([l])).toHaveLength(0);
	});

	/** A counted zero IS a finding — the shelf is empty, and that is different from not looking. */
	it('a counted zero is a real variance', () => {
		const l = line({ counted: units(0) });
		expect(difference(l).e6).toBe(units(-18).e6);
		expect(varyingLines([l])).toHaveLength(1);
	});

	it('a line that matched is not a variance, so it writes no movement', () => {
		expect(varyingLines([line({ counted: units(18) })])).toHaveLength(0);
	});

	it('counts progress the way the footer states it', () => {
		const lines = [line(), line({ id: 'l2', counted: null }), line({ id: 'l3' })];
		expect(countProgress(lines)).toEqual({ counted: 2, total: 3 });
	});

	/**
	 * The full worked count nets to −R8 000. Built here as the design's −R7 120 oak line plus a
	 * second variance making up the difference, so the netting itself is what is under test.
	 */
	it('nets the whole count to one figure', () => {
		const lines = [
			line(),
			line({
				id: 'l2',
				itemId: 'item-oil',
				expected: units(10),
				counted: units(8),
				costPrice: unitPrice(440_000_000, ZAR)
			}),
			line({ id: 'l3', counted: null })
		];
		const { net, uncosted } = netValueEffect(ZAR, lines);
		expect(net.cents).toBe(-712_000 - 88_000);
		expect(formatZar(net)).toBe(nb('-R8 000,00'));
		expect(uncosted).toBe(0);
	});

	/**
	 * An item with no recorded cost has no value effect — not a zero one. A total that quietly
	 * folded an unknown in as nothing, while presenting itself as complete, would be the
	 * interface understating a loss. The count comes back beside the figure so the screen can
	 * say so.
	 */
	it('reports what it could not value rather than counting it as nothing', () => {
		const lines = [line(), line({ id: 'l2', costPrice: null, counted: units(2) })];
		const { net, uncosted } = netValueEffect(ZAR, lines);

		expect(net.cents).toBe(-712_000);
		expect(uncosted).toBe(1);
	});
});

describe('the filter tabs and the rows they show', () => {
	it('all shows live items and hides archived ones', () => {
		expect(matchesFilter('all', row())).toBe(true);
		expect(matchesFilter('all', row({ item: item({ archivedAt: new Date() }) }))).toBe(false);
	});

	it('low narrows all rather than partitioning it', () => {
		const low = row({ onHand: units(4) });
		expect(matchesFilter('all', low)).toBe(true);
		expect(matchesFilter('low', low)).toBe(true);
	});

	/**
	 * An archived item is never "running low", however little is left. The business has said it no
	 * longer stocks the thing, and "3 running low" would be a lie if one of the three were
	 * something nobody intends to reorder.
	 */
	it('an archived item is never running low', () => {
		const archived = row({ onHand: units(0), item: item({ archivedAt: new Date() }) });
		expect(matchesFilter('low', archived)).toBe(false);
		expect(matchesFilter('archived', archived)).toBe(true);
	});
});

describe('the words the screens say', () => {
	/** T27 §6: the badge carries a WORD, so the signal survives with colour removed. */
	it('states the stock state in words, not only a tone', () => {
		expect(stockCopy(item(), units(4)).text).toBe('Running low');
		expect(stockCopy(item(), units(40)).text).toBe('In stock');
		expect(stockCopy(item({ archivedAt: new Date() }), units(0)).text).toBe('Archived');
	});

	/** The second colour-free carrier: the quantity said against the point it is measured by. */
	it('says the quantity against its reorder point', () => {
		expect(stockCopy(item(), units(4)).against).toBe('4 of 12');
	});

	it('states a zero rather than hiding it', () => {
		expect(summarySentence({ itemCount: 48, lowCount: 0, locationCount: 5 })).toBe(
			'48 items counted, none running low.'
		);
	});

	it('names the count when there is one', () => {
		expect(summarySentence({ itemCount: 48, lowCount: 3, locationCount: 5 })).toBe(
			'48 items counted, 3 running low.'
		);
	});

	/** The seams that make a product feel unfinished: "1 items", "1 are running low". */
	it('reads correctly in the singular', () => {
		expect(summarySentence({ itemCount: 1, lowCount: 0, locationCount: 1 })).toBe(
			'1 item counted, none running low.'
		);
		expect(summarySentence({ itemCount: 1, lowCount: 1, locationCount: 1 })).toBe(
			'1 item counted, and it is running low.'
		);
	});

	/** An empty module is a different sentence, not the same one with zeroes in it. */
	it('has its own sentence for nothing at all', () => {
		expect(summarySentence({ itemCount: 0, lowCount: 0, locationCount: 0 })).toBe(
			'Nothing counted yet.'
		);
	});

	it('says why a quantity changed in plain words, never the enum', () => {
		expect(movementReasonCopy('stock_count', null)).toBe('Adjusted after a stock count');
		expect(movementReasonCopy('invoice', 'INV-1042')).toBe('Used on an invoice · INV-1042');
	});

	it('states where an item stands in one line', () => {
		expect(standingSentence(item(), units(12), 'Rack A')).toBe(
			'12 board on hand in Rack A. Reorder at 12.'
		);
	});

	it('does not invent a home for an item that has none', () => {
		expect(standingSentence(item(), units(12), null)).toBe('12 board on hand. Reorder at 12.');
	});

	/**
	 * SPA-6 makes this an acceptance criterion: an empty module and a filter matching nothing are
	 * different states. The empty module explains what the module is for; the empty filter is good
	 * news and offers no action.
	 */
	it('distinguishes an empty module from a filter matching nothing', () => {
		expect(emptyCopy('all')).not.toBe(emptyCopy('low'));
		expect(emptyCopy('low')).toBe('Nothing running low. That is usually good news.');
	});

	/**
	 * The third state, and the one that is easy to miss: a business that has archived everything
	 * has an empty `All` tab and is NOT a first-run. Telling somebody with eleven archived items
	 * to "add your first item" is the interface failing to notice what they already have.
	 */
	it('does not call an all-archived business a first-run', () => {
		const firstRun = emptyCopy('all', false);
		const allArchived = emptyCopy('all', true);

		expect(firstRun).not.toBe(allArchived);
		expect(firstRun).toMatch(/first item/i);
		expect(allArchived).not.toMatch(/first item/i);
		// It points at the tab that holds the answer, rather than leaving them to find it.
		expect(allArchived).toMatch(/archived/i);
	});
});
