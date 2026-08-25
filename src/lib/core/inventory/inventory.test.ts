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
import { ZAR, formatZar, type Money, type Quantity } from '$lib/core/money';
import {
	countProgress,
	difference,
	isBelowReorderPoint,
	netValueEffect,
	onHand,
	onHandAt,
	varyingLines
} from './stock';
import {
	COUNT_STEPS,
	countPeriodFor,
	stepOfStatus,
	triageCount,
	type CountSheetRow
} from './counting';
import { matchesFilter } from './filter';
import {
	countAppliedCopy,
	countProgressLine,
	countReassurance,
	countReviewCopy,
	countStartedLine,
	countTitle,
	emptyCopy,
	homeStandingCopy,
	matchedRowLabel,
	movementReasonCopy,
	reviewChangesLabel,
	standingSentence,
	stockCopy,
	summarySentence,
	uncostedNote
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
});

/**
 * WHAT HOME IS TOLD ABOUT STOCK.
 *
 * One sentence with two answers, and the shapes below are every way it comes out. The concern is
 * the interesting half: SPA-8 is explicit that it names what is low rather than saying "check
 * your stock", so what is asserted here is that the names actually arrive in the sentence, and
 * that the count and the names agree about how many were left out.
 *
 * THE NAMES COME BACK ALPHABETICAL. `stockStanding` orders them by name, so the ticket's
 * illustrative "European oak, Danish oil and one other" reads as "Danish oil, European oak and
 * one other" against real rows. Asserted deliberately, so nobody pastes the ticket's order in and
 * gets a red test for the wrong reason.
 */
describe('what Home is told about stock', () => {
	it('reassures with the count, and says the zero rather than hiding it', () => {
		expect(homeStandingCopy(48, [], 0)).toEqual({
			statement: '48 items counted',
			explanation: 'None running low.'
		});
	});

	it('does not say "1 items"', () => {
		expect(homeStandingCopy(1, [], 0).statement).toBe('1 item counted');
	});

	/** The concern, in the same register as the reassurance — a fact, with the thing named. */
	it('names the one item that is running low', () => {
		expect(homeStandingCopy(48, ['European oak'], 1)).toEqual({
			statement: '1 item is running low',
			explanation: 'European oak. Out of 48 items you count.'
		});
	});

	it('agrees with itself about the verb when there are several', () => {
		expect(homeStandingCopy(48, ['Danish oil', 'European oak'], 2)).toEqual({
			statement: '2 items are running low',
			explanation: 'Danish oil · European oak. Out of 48 items you count.'
		});
	});

	/** Two names, then a count. A list that wraps at 12px stops being a glance. */
	it('names two and counts the rest', () => {
		expect(homeStandingCopy(48, ['Danish oil', 'European oak'], 3).explanation).toBe(
			'Danish oil · European oak · and one other. Out of 48 items you count.'
		);

		expect(homeStandingCopy(48, ['Danish oil', 'European oak'], 5).explanation).toBe(
			'Danish oil · European oak · and 3 others. Out of 48 items you count.'
		);
	});

	/** Every item counted and every one of them low is a real state, and not a special sentence. */
	it('holds up when everything is running low', () => {
		expect(homeStandingCopy(2, ['Danish oil', 'European oak'], 2).explanation).toBe(
			'Danish oil · European oak. Out of 2 items you count.'
		);
	});

	/**
	 * THE REASON THE SEPARATOR IS NOT A COMMA. Half the names in a joinery's stock have one in
	 * them, and comma-joined these two read as four things.
	 */
	it('stays legible when the item names themselves contain commas', () => {
		expect(homeStandingCopy(6, ['European oak, 40mm board', 'Danish oil, 5L'], 3).explanation).toBe(
			'European oak, 40mm board · Danish oil, 5L · and one other. Out of 6 items you count.'
		);
	});

	it('states the progress on a count somebody left part-finished', () => {
		expect(countProgressLine(18, 48)).toBe('18 of 48 counted');
		expect(countProgressLine(0, 48)).toBe('0 of 48 counted');
		expect(countProgressLine(1, 1)).toBe('1 of 1 counted');
	});

	/** A count is a period, not a day — so it is named by its month, in the business's locale. */
	it('names a count by its month', () => {
		expect(countTitle('2026-07-01', '2026-07-31', 'en-ZA')).toBe('Stock count · July');
	});

	it('names both months when a period straddles two', () => {
		expect(countTitle('2026-06-15', '2026-07-14', 'en-ZA')).toBe('Stock count · June to July');
	});

	/**
	 * December to January crosses a year as well as a month, and is the case where a naive
	 * `getMonth()` and a timezone-sensitive parse both go wrong in different directions.
	 */
	it('crosses a year without losing the months', () => {
		expect(countTitle('2026-12-01', '2027-01-31', 'en-ZA')).toBe(
			'Stock count · December to January'
		);
	});

	/**
	 * The first of the month is where a timezone shift would show: read in a zone behind UTC, a
	 * period starting 1 July becomes 30 June and the count is titled with the wrong month.
	 */
	it('does not slip a month on the first of one', () => {
		expect(countTitle('2026-07-01', '2026-07-01', 'en-ZA')).toBe('Stock count · July');
	});
});

/**
 * THE TRIAGE — the promise the reassurance line makes about the table underneath it.
 *
 * "6 are different — they're at the top of the list." That sentence is only true if something
 * puts them there, and this is the something.
 */
describe('triaging a count sheet', () => {
	function sheet(over: Partial<StockCountLine> & { name?: string; place?: string }): CountSheetRow {
		const { name = 'European oak, 40mm board', place = 'Rack A', ...rest } = over;
		return {
			line: line({ id: `line-${name}`, ...rest }),
			itemName: name,
			locationName: place,
			unit: 'board'
		};
	}

	const oak = sheet({ name: 'European oak', expected: units(18), counted: units(14) });
	const ply = sheet({
		name: 'Birch ply',
		expected: units(9),
		counted: units(12),
		costPrice: unitPrice(400_000_000, ZAR)
	});
	const matched = sheet({ name: 'Sash clamp', expected: units(4), counted: units(4) });
	const notYet = sheet({ name: 'Piano hinge', expected: units(11), counted: null });

	it('puts everything that is not settled above everything that is', () => {
		const { differing, matched: same } = triageCount([matched, notYet, oak, ply]);

		expect(differing.map((r) => r.itemName)).toEqual(['European oak', 'Birch ply', 'Piano hinge']);
		expect(same.map((r) => r.itemName)).toEqual(['Sash clamp']);
	});

	/**
	 * A variance is a finding; an uncounted line is a gap. The design counts both as "different"
	 * — 5 variances plus 1 unvisited shelf is its "6 are different" — but a shelf nobody reached
	 * is not a thing to approve, so it sits below the ones that are.
	 */
	it('ranks variances above shelves nobody has reached', () => {
		expect(triageCount([notYet, ply]).differing.map((r) => r.state)).toEqual(['varies', 'not-yet']);
	});

	/**
	 * Money leads, not units. Four boards at R1 780 and four boxes of screws at R96 are the same
	 * difference in units and nothing like the same problem.
	 */
	it('orders variances by what they are worth, not by how many', () => {
		const screws = sheet({
			name: 'Brass screws',
			expected: units(40),
			counted: units(45),
			costPrice: unitPrice(96_000_000, ZAR)
		});

		expect(triageCount([screws, ply, oak]).differing.map((r) => r.itemName)).toEqual([
			'European oak',
			'Birch ply',
			'Brass screws'
		]);
	});

	/** A line whose item has no cost cannot be ranked against a figure, so it goes after them. */
	it('puts a variance nobody can value after the ones that can be', () => {
		const offcuts = sheet({
			name: 'Offcuts',
			expected: units(6),
			counted: units(2),
			costPrice: null
		});

		const order = triageCount([offcuts, ply]).differing;
		expect(order.map((r) => r.itemName)).toEqual(['Birch ply', 'Offcuts']);
		expect(order[1].valueEffect).toBeNull();
	});

	/** A counted zero against an expected 12 is a variance. A null is not. */
	it('tells a counted zero apart from a shelf nobody looked at', () => {
		const empty = sheet({ name: 'Danish oil', expected: units(12), counted: units(0) });
		const untouched = sheet({ name: 'Beeswax', expected: units(12), counted: null });

		const { differing } = triageCount([empty, untouched]);
		expect(differing.find((r) => r.itemName === 'Danish oil')?.state).toBe('varies');
		expect(differing.find((r) => r.itemName === 'Beeswax')?.state).toBe('not-yet');
	});

	/** The caller's own order — `position`, which is how somebody walks the racks — is not moved. */
	it('leaves the array it was given alone', () => {
		const given = [matched, oak, notYet];
		triageCount(given);
		expect(given.map((r) => r.itemName)).toEqual(['Sash clamp', 'European oak', 'Piano hinge']);
	});

	it('does the arithmetic through the same functions the transaction uses', () => {
		const [worst] = triageCount([oak]).differing;
		expect(worst.difference.e6).toBe(units(-4).e6);
		expect(formatZar(worst.valueEffect as Money)).toBe(nb('-R7 120,00'));
	});
});

describe('the step a count is on', () => {
	/** The status is the step. There is no second opinion in a URL. */
	it('maps each status to its step', () => {
		expect(stepOfStatus('preparing')).toBe(1);
		expect(stepOfStatus('counting')).toBe(2);
		expect(stepOfStatus('reviewing')).toBe(3);
		expect(stepOfStatus('applied')).toBe(4);
	});

	it('labels every step with a verb', () => {
		expect(COUNT_STEPS).toEqual(['Prepare', 'Count', 'Review changes', 'Update stock']);
	});
});

describe('what the reassurance line says', () => {
	/** T24's own two statements, to the word. */
	it('reproduces the line the design prints', () => {
		const said = countReassurance({ matched: 42, differing: 6, counted: 47, total: 48 });
		expect(said.matched).toBe('42 of 48 items match what we expected.');
		expect(said.differing).toBe("6 are different — they're at the top of the list.");
		expect(said.settled).toBe(true);
	});

	/** An untouched sheet is not a catastrophe, so it does not get "0 of 48 match". */
	it('has its own words for a count nobody has started', () => {
		const said = countReassurance({ matched: 0, differing: 48, counted: 0, total: 48 });
		expect(said.matched).toBe('Nothing counted yet — 48 items to look at.');
		expect(said.differing).toBeNull();
		expect(said.settled).toBe(false);
	});

	it('says so when everything matched', () => {
		const said = countReassurance({ matched: 48, differing: 0, counted: 48, total: 48 });
		expect(said.matched).toBe('All 48 items match what we expected.');
		expect(said.differing).toBeNull();
	});

	it('withholds the tick while every counted line is a variance', () => {
		const said = countReassurance({ matched: 0, differing: 3, counted: 3, total: 3 });
		expect(said.matched).toBe('Nothing counted so far matches what we expected.');
		expect(said.settled).toBe(false);
	});

	it('reads correctly for one of anything', () => {
		expect(countReassurance({ matched: 0, differing: 1, counted: 1, total: 1 }).differing).toBe(
			"One is different — it's at the top of the list."
		);
		expect(countReassurance({ matched: 0, differing: 1, counted: 0, total: 1 }).matched).toBe(
			'Nothing counted yet — 1 item to look at.'
		);
		expect(countReassurance({ matched: 1, differing: 0, counted: 1, total: 1 }).matched).toBe(
			'The one item matches what we expected.'
		);
	});

	it('has something to say about a business with nothing in it', () => {
		expect(countReassurance({ matched: 0, differing: 0, counted: 0, total: 0 }).matched).toBe(
			'There is nothing to count.'
		);
	});
});

describe('the words on the count controls', () => {
	it('collapses the matches into a row that says how many', () => {
		expect(matchedRowLabel(42)).toBe('42 items matched exactly');
		expect(matchedRowLabel(1)).toBe('1 item matched exactly');
		expect(matchedRowLabel(0)).toBe('0 items matched exactly');
	});

	/** The primary action NAMES THE COUNT. "Review 5 changes", never "Continue". */
	it('names the number of changes on the primary action', () => {
		expect(reviewChangesLabel(5)).toBe('Review 5 changes');
		expect(reviewChangesLabel(1)).toBe('Review 1 change');
	});

	/** A count with nothing to change still goes through the gate, but cannot claim a number. */
	it('still offers the gate when nothing changed', () => {
		expect(reviewChangesLabel(0)).toBe('Review this count');
	});
});

describe('when a count was started', () => {
	const at = (iso: string) => Date.parse(iso);

	it('says today, yesterday, then the weekday', () => {
		const now = at('2026-08-06T09:00:00Z');
		expect(countStartedLine(at('2026-08-06T07:00:00Z'), now, 'en-ZA')).toBe('Started today');
		expect(countStartedLine(at('2026-08-05T18:00:00Z'), now, 'en-ZA')).toBe('Started yesterday');
		// T24's own line: "Started Tuesday".
		expect(countStartedLine(at('2026-08-04T10:00:00Z'), now, 'en-ZA')).toBe('Started Tuesday');
	});

	/** A weekday stops naming a unique day once a week has gone by, so a date takes over. */
	it('falls back to a date once a weekday is a riddle', () => {
		const now = at('2026-08-06T09:00:00Z');
		// The zero-padded day is `en-ZA`'s own answer, not ours. The locale decides how a date
		// is spelled in this product; this function only decides WHICH date to show.
		expect(countStartedLine(at('2026-07-02T10:00:00Z'), now, 'en-ZA')).toBe('Started 02 Jul');
	});
});

describe('a total that could not value everything says so', () => {
	it('says nothing when there is nothing to disclose', () => {
		expect(uncostedNote(0)).toBeNull();
	});

	it('names how many lines are missing from the figure', () => {
		expect(uncostedNote(1)).toBe('One of these has no cost recorded, so it is not in that figure.');
		expect(uncostedNote(3)).toBe(
			'3 of these have no cost recorded, so they are not in that figure.'
		);
	});
});

describe('what the last point of return says', () => {
	it('names how many lines will change, and that nothing else will', () => {
		const said = countReviewCopy(5, 0);
		expect(said.headline).toBe('5 lines will change your stock.');
		expect(said.explanation).toBe(
			'Applying this count records one movement per line below. Nothing else in your stock moves.'
		);
	});

	/** The shelf nobody reached is the fact an interface forgets, and the one worth stating. */
	it('says what happens to the shelves nobody reached', () => {
		expect(countReviewCopy(5, 1).explanation).toContain(
			'One line was never counted, and nothing will be recorded against it.'
		);
		expect(countReviewCopy(5, 3).explanation).toContain(
			'3 lines were never counted, and nothing will be recorded against them.'
		);
	});

	/** A count where everything matched happened, is recorded, and moves nothing. */
	it('has a plain answer for a count that changes nothing', () => {
		const said = countReviewCopy(0, 0);
		expect(said.headline).toBe('Nothing will change.');
		expect(said.explanation).toBe(
			'Everything you counted matched what we expected, so applying this count records no movements.'
		);
	});

	it('reads correctly for one line', () => {
		expect(countReviewCopy(1, 0).headline).toBe('1 line will change your stock.');
	});
});

describe('what step 4 says happened', () => {
	it('says what was done, and where to go and check it', () => {
		const said = countAppliedCopy(5);
		expect(said.headline).toBe('Your stock is up to date.');
		expect(said.explanation).toContain('5 movements recorded');
		expect(said.explanation).toContain("item's history");
	});

	it('reads correctly for one movement', () => {
		expect(countAppliedCopy(1).explanation).toContain('1 movement recorded');
	});

	/** A count where everything agreed is a good outcome, not an anticlimax to be dressed up. */
	it('says plainly when nothing moved', () => {
		expect(countAppliedCopy(0).explanation).toContain('nothing moved');
	});
});

describe('the period a new count covers', () => {
	it('is the calendar month you are standing in', () => {
		expect(countPeriodFor('2026-08-25')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
	});

	it('knows how long a short month is', () => {
		expect(countPeriodFor('2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
		expect(countPeriodFor('2026-04-30')).toEqual({ start: '2026-04-01', end: '2026-04-30' });
	});

	/** The case month arithmetic on a `Date` gets wrong, so it is asserted rather than assumed. */
	it('handles a leap February and the last day of the year', () => {
		expect(countPeriodFor('2028-02-29')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
		expect(countPeriodFor('2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
	});
});
