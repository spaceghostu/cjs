/**
 * THE COUNT SHEET, TRIAGED — and the four steps it moves through.
 *
 * T24's reassurance line is a claim the interface has to earn: "6 are different — they're at the
 * top of the list." The person holding the clipboard should not have to scroll forty-two rows
 * looking for the two that matter. So the triage happens here, in a pure function, and the screen
 * renders what it is handed.
 *
 * THREE STATES, NOT TWO. A line either MATCHES, VARIES, or has NOT BEEN COUNTED — and the third
 * is not a weaker version of the second. `stock.ts` already refuses to treat an uncounted line as
 * a finding, because posting every unvisited rack as a total loss is the worst thing this module
 * could do. But an uncounted line is still not *settled*, so it belongs at the top of the sheet
 * with the differences rather than folded into "42 items matched exactly". That is exactly the
 * design's own arithmetic: 42 match, 6 are "different", and those 6 are five variances plus one
 * shelf nobody has reached.
 *
 * THE ORDER IS COMPUTED ONCE, NOT LIVE. This is the decision most worth stating, because the
 * obvious implementation is the wrong one. If the sheet re-sorted on every keystroke, typing a
 * quantity into row three would move row three — out from under the cursor, mid-count, while
 * somebody is looking at a shelf and not at the screen. A table that rearranges itself as you
 * work is not doing triage, it is taking your place away. So the server orders the sheet when the
 * page loads and the browser keeps that order; a count that has moved on is re-triaged on the
 * next load, which is the moment a person is looking at the whole sheet again anyway.
 *
 * REJECTED: sorting purely by absolute difference in UNITS. Four boards at R1 780 and four boxes
 * of screws at R96 are the same difference and nothing like the same problem. The money is what
 * the owner is being asked to approve at step 3, so the money is what leads — with the quantity
 * as the tie-break, and lines whose item has no recorded cost after the ones that can be valued,
 * because "we don't know what this is worth" cannot be ranked against a figure.
 */
import {
	absMoney,
	cmpMoney,
	cmpQty,
	isQtyZero,
	negateQty,
	type Money,
	type Quantity
} from '$lib/core/money';
import { about, checkQuantity, invalid, problem, type Checked } from '$lib/core/validation';
import type { CalendarDate } from '$lib/core/calendar';
import { settleLine } from './stock';
import type { StockCountLine, StockCountStatus } from './types';

/** What a message about a count box calls the box. Said, because "Enter a number" of what? */
export const COUNTED_FIELD = 'How many you counted';

/**
 * "MAY THIS BE STORED AS A COUNT?" — asked in exactly one place, by both sides of the wire.
 *
 * The browser calls it to decide whether to put a message under an input; the server calls it
 * in `modules/inventory/wire.ts` to decide whether to store anything at all. ONE function, so
 * the sentence a person reads while typing and the sentence they get back if they submit anyway
 * cannot be two different sentences — which is what happens the moment a component writes its
 * own copy for a number it could not read.
 *
 * `null` FOR A BLANK BOX, and that is not a refusal. An empty input is "I have not looked at
 * this one yet", which is a chosen, storable state — the only way back from a quantity typed
 * into the wrong row. A validator that treated it as missing would make the mistake unfixable.
 *
 * The negative check is here rather than in `checkQuantity` because a negative quantity is
 * perfectly legitimate elsewhere — a movement leaving a shelf is one — and it is only a count
 * that cannot have one. Nobody counts minus four boards onto a rack.
 */
export function checkCounted(raw: string, field: string): Checked<Quantity> | null {
	const text = raw.trim();
	if (text === '') return null;

	const checked = checkQuantity(text, field);
	if (!checked.ok) return invalid(about(checked.problems[0], COUNTED_FIELD));

	if (checked.value.e6 < 0) {
		return invalid(about(problem('cannot be a negative number', { field }), COUNTED_FIELD));
	}

	return checked;
}

/**
 * THE LINE AS THE BOX CURRENTLY READS IT — the one function the table and the footer share.
 *
 * T24 makes this an acceptance criterion in as many words: "the footer running total updates
 * live and matches the review step exactly". The only way to keep that true is for the running
 * total and the row it is a total of to be worked out by the same code from the same input, so
 * both call this and neither interprets a box for itself.
 *
 * AN UNREADABLE BOX FALLS BACK TO THE LAST SAVED VALUE, rather than to zero or to nothing. Half
 * a keystroke is not a claim about a shelf: the row is already showing a message, nothing has
 * been sent to the server, and the honest figure to keep totalling is the one the server last
 * acknowledged. Zeroing it would make the footer lurch every time somebody typed a comma.
 */
export function liveLine(line: StockCountLine, text: string): StockCountLine {
	const checked = checkCounted(text, line.id);

	// A cleared box un-counts the line. Rebuilt only when it changes something, so an untouched
	// sheet hands back the very objects it was given.
	if (checked === null) return line.counted === null ? line : { ...line, counted: null };
	if (!checked.ok) return line;

	return { ...line, counted: checked.value };
}

/**
 * One row of the sheet: the line, plus the two names that send somebody to the right shelf.
 *
 * The names are carried alongside rather than folded into `StockCountLine`, because the line is
 * what `applyCount` and `netValueEffect` operate on and neither of them has any business knowing
 * what a location is called. The screen needs both; the arithmetic needs one.
 */
export type CountSheetRow = {
	readonly line: StockCountLine;
	readonly itemName: string;
	readonly locationName: string;
	/** "board", "litre" — the business's own word, printed next to every quantity. */
	readonly unit: string;
};

/** Where a line has got to. Drives the rendering, and it is deliberately not a boolean. */
export type CountLineState = 'matches' | 'varies' | 'not-yet';

/** A sheet row with its arithmetic done and its state named. */
export type TriagedRow = CountSheetRow & {
	readonly state: CountLineState;
	readonly difference: Quantity;
	readonly valueEffect: Money | null;
};

export type CountTriage = {
	/** Variances first, then the shelves nobody has reached. The top of the design's list. */
	readonly differing: readonly TriagedRow[];
	/** The rows the final row collapses into "42 items matched exactly". */
	readonly matched: readonly TriagedRow[];
};

function stateOf(row: CountSheetRow, difference: Quantity): CountLineState {
	if (row.line.counted === null) return 'not-yet';
	return isQtyZero(difference) ? 'matches' : 'varies';
}

/** Absolute value of a difference, without a second opinion about how to negate one. */
function magnitude(q: Quantity): Quantity {
	return q.e6 < 0 ? negateQty(q) : q;
}

/**
 * Rank within the "different" group: variances above uncounted, biggest money first.
 *
 * Returns a comparator rather than a sort key, because the tie-break chain is four deep and a
 * composite key would have to encode "no cost recorded" as a number — which is the same lie as
 * rendering an absent price as `R0`.
 */
function compareDiffering(a: TriagedRow, b: TriagedRow): number {
	// A variance is a finding; an uncounted line is a gap. Findings first.
	if (a.state !== b.state) return a.state === 'varies' ? -1 : 1;

	const aValued = a.valueEffect !== null;
	const bValued = b.valueEffect !== null;
	if (aValued !== bValued) return aValued ? -1 : 1;

	if (aValued && bValued) {
		const byMoney = cmpMoney(absMoney(b.valueEffect as Money), absMoney(a.valueEffect as Money));
		if (byMoney !== 0) return byMoney;
	}

	const byQty = cmpQty(magnitude(b.difference), magnitude(a.difference));
	if (byQty !== 0) return byQty;

	return a.itemName.localeCompare(b.itemName);
}

/**
 * Split a sheet into what needs looking at and what does not.
 *
 * Immutable: the input array is never sorted in place. A caller holding the sheet in the order
 * the database returned it — which is `position`, which is the order somebody would walk the
 * racks — keeps that order for anything else it wants to do with it.
 */
export function triageCount(rows: readonly CountSheetRow[]): CountTriage {
	const triaged = rows.map((row): TriagedRow => {
		const settled = settleLine(row.line);
		return {
			...row,
			state: stateOf(row, settled.difference),
			difference: settled.difference,
			valueEffect: settled.valueEffect
		};
	});

	return {
		differing: triaged.filter((row) => row.state !== 'matches').sort(compareDiffering),
		matched: triaged.filter((row) => row.state === 'matches')
	};
}

/**
 * THE PERIOD A NEW COUNT COVERS: the calendar month somebody is standing in.
 *
 * A count is named by its month rather than dated — `countTitle` says why — so the period has to
 * be a whole month or the name is a lie about half of itself. The CURRENT month rather than the
 * last complete one, because a stock count is a statement about what is on the shelf right now:
 * somebody walking the racks today is counting today's stock, and dating that as June's would put
 * the count in a period whose movements have already been reported on.
 *
 * Built by slicing the date string rather than by adding months to a `Date`, because "the 31st of
 * the previous month" is where month arithmetic goes wrong. The one `Date` here is transient and
 * is asked exactly one question: how many days this month has.
 */
export function countPeriodFor(today: CalendarDate): {
	start: CalendarDate;
	end: CalendarDate;
} {
	const month = today.slice(0, 7);
	const year = Number(today.slice(0, 4));
	const monthNumber = Number(today.slice(5, 7));

	// Day 0 of the NEXT month is the last day of this one. Read at midday UTC, like every other
	// calendar date that crosses a boundary in this codebase.
	const lastDay = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();

	return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * THE FOUR STEPS, AND THE LABELS ARE VERBS.
 *
 * "Update stock", not "Commit". T24 is explicit about this and it is worth a sentence: a stepper
 * is the one place an application tells somebody what is about to happen to them, and "Commit" is
 * a word from our side of the screen. Every label here is something a person would say they were
 * doing.
 *
 * The step a count is ON is derived from its STATUS, not held in the URL. A `?step=4` in a
 * bookmark would be a second opinion about whether stock has been updated, and the database
 * already has the only one that counts — `inventory_stock_count.status`, guarded by
 * `app.freeze_applied_count()`, which is what refuses to let an applied count go backwards.
 */
export const COUNT_STEPS = ['Prepare', 'Count', 'Review changes', 'Update stock'] as const;

export type CountStep = 1 | 2 | 3 | 4;

export function stepOfStatus(status: StockCountStatus): CountStep {
	switch (status) {
		case 'preparing':
			return 1;
		case 'counting':
			return 2;
		case 'reviewing':
			return 3;
		case 'applied':
			return 4;
	}
}
