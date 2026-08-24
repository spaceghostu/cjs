/**
 * THE WORDS ON THE INVENTORY SCREENS.
 *
 * The design's reassurance for this module is one sentence — "Stock levels healthy / 48 items
 * counted, none running low" — and the concern it must be able to become is the same sentence
 * with the other answer. Both are generated here, from counts, so that neither can be a template
 * somebody filled in awkwardly.
 *
 * WHY EVERY WORD IS IN THIS FILE
 * ------------------------------
 *  1. THE COPY IS PLAIN. "Running low", not `BELOW_REORDER_POINT`. An enum name leaking onto a
 *     screen is the fastest way a product stops sounding like a person wrote it.
 *
 *  2. COLOUR IS NEVER THE ONLY SIGNAL. T27 §6 requires the meaning to survive with colour
 *     removed, and these strings are how: the badge carries a WORD, and the quantity states
 *     itself against its reorder point ("4 of 12") so the comparison is legible in greyscale.
 *     The tone only reinforces what the text already said.
 *
 *  3. A ZERO IS STATED, NEVER HIDDEN. T20's rule about `Overdue 0` applies here unchanged: "none
 *     running low" is the sentence an owner most wants to read, and it cannot appear if the
 *     interface only mentions the count when it is bad news.
 */
import type { CalendarDate } from '$lib/core/calendar';
import { formatQty, type Quantity } from '$lib/core/money';
import { isBelowReorderPoint } from './stock';
import type { InventoryItem, MovementReason } from './types';

/** The badge tones T02 offers. `settled` is the calm one; `attention` is amber, not red. */
export type Tone = 'draft' | 'sent' | 'settled' | 'attention' | 'wrong';

export type StockCopy = {
	readonly text: string;
	readonly tone: Tone;
	/**
	 * The quantity said against the point it is measured by — "4 of 12".
	 *
	 * This is the second carrier of the running-low signal, and the one that works with no colour
	 * and no badge at all. A bare "4" needs another column to mean anything; "4 of 12" does not.
	 */
	readonly against: string;
};

/**
 * What one row's stock state says.
 *
 * An archived item reports as archived and nothing else — not "running low", however little of
 * it is left. The business has said it no longer stocks the thing, and urgency about it would be
 * the interface arguing with a decision somebody already made.
 */
export function stockCopy(item: InventoryItem, onHand: Quantity): StockCopy {
	const against = `${formatQty(onHand)} of ${formatQty(item.reorderPoint)}`;

	if (item.archivedAt !== null) return { text: 'Archived', tone: 'draft', against };
	if (isBelowReorderPoint(item, onHand)) return { text: 'Running low', tone: 'attention', against };
	return { text: 'In stock', tone: 'settled', against };
}

/** What the header sentence needs to know. Counts and facts — never a pre-made string. */
export type SummaryFacts = {
	readonly itemCount: number;
	readonly lowCount: number;
	readonly locationCount: number;
};

/**
 * THE SCREEN'S WHOLE STATE, IN ONE SENTENCE A PERSON WOULD SAY OUT LOUD.
 *
 * The design's own line is "48 items counted, none running low", and the shapes below are every
 * way that sentence has to come out. Generated rather than templated, because "1 items" and
 * "1 are running low" are exactly the seams that make a product feel unfinished — and because
 * the empty case is a different sentence, not the same one with zeroes in it.
 */
export function summarySentence(facts: SummaryFacts): string {
	const { itemCount, lowCount } = facts;

	if (itemCount === 0) return 'Nothing counted yet.';

	const items = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

	if (lowCount === 0) return `${items} counted, none running low.`;
	if (lowCount === itemCount && itemCount === 1) return `1 item counted, and it is running low.`;
	if (lowCount === itemCount) return `${items} counted, and all of them are running low.`;

	return `${items} counted, ${lowCount} running low.`;
}

/**
 * WHAT HOME SAYS ABOUT STOCK.
 *
 * `summarySentence` above says this in one line for the module's own header. Home has two lines
 * to work with — a 14px statement and a 12px explanation — and a different job: it sits beside
 * Quoting's and Invoicing's reassurances and has to read as one voice with them.
 *
 * SO THE COUNT LEADS, NOT A MOOD. The design's line is "Stock levels healthy / 48 items counted,
 * none running low", but its neighbours on that panel are "6 invoices still unpaid / None of them
 * overdue" and "3 quotes waiting on clients / Sent 4 to 11 days ago". Every one of them states a
 * number and then says what is reassuring about it. "Stock levels healthy" would make this the
 * one panel offering a judgement instead, so the same two facts are split the way the neighbours
 * split theirs.
 *
 * AND THE CONCERN NAMES THINGS — items below their reorder point, named and counted, never "check
 * your stock". A standing point that only said something was wrong would send somebody into the
 * module to find out what, which is the opposite of what this panel is for.
 */
export type StandingCopy = { readonly statement: string; readonly explanation: string };

export function homeStandingCopy(
	itemCount: number,
	lowNames: readonly string[],
	lowCount: number
): StandingCopy {
	const items = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

	// The zero is stated, not hidden — same rule as `summarySentence`. It is the number an owner
	// most wants confirmed, and it cannot appear if we only mention it when it is bad news.
	if (lowCount === 0) {
		return { statement: `${items} counted`, explanation: 'None running low.' };
	}

	return {
		statement: `${lowCount} ${lowCount === 1 ? 'item is' : 'items are'} running low`,
		explanation: `${lowNamesSentence(lowNames, lowCount)} Out of ${items} you count.`
	};
}

/**
 * "European oak, 40mm board · Danish oil, 5L · and one other."
 *
 * TWO NAMES, THEN A COUNT. Two because the panel gives this one line at 12px, and a list that
 * wraps stops being a glance. The rest is a number, which is more use than a truncation.
 *
 * SEPARATED BY `·`, NOT COMMAS, and that is not decoration. An item's name is the business's own
 * and half of them have a comma in them — "European oak, 40mm board", "Danish oil, 5L". Joined
 * with commas, two of those read as four things. The interpunct is already how this module holds
 * two facts apart on one line ("Rack A · and one other place"), so the tail follows the same
 * shape rather than reintroducing the comma at the end.
 */
function lowNamesSentence(names: readonly string[], total: number): string {
	const shown = names.slice(0, 2);
	if (shown.length === 0) return '';

	const remaining = total - shown.length;
	const rest = remaining === 1 ? 'and one other' : `and ${remaining} others`;

	return `${(remaining > 0 ? [...shown, rest] : shown).join(' · ')}.`;
}

/**
 * "18 of 48 counted" — how far into a stock count somebody got before they stopped.
 *
 * A resume card has to say what you will find when you get there. Without the progress it is a
 * link with extra steps, and the decision to go back in gets made after loading the count rather
 * than on Home, which is the whole thing this section exists to avoid. `countProgress` in
 * `stock.ts` produces the two numbers.
 */
export function countProgressLine(counted: number, total: number): string {
	return `${counted} of ${total} counted`;
}

/**
 * "Stock count · July" — what to call a count on a card.
 *
 * A count covers a PERIOD, not a day, so it is named by its month rather than dated; one that
 * straddles two months says so rather than picking one and being quietly wrong about half of
 * itself. The number a count also has is deliberately not used here: `SC-0007` is internal, and
 * nobody outside the business ever sees it.
 *
 * Read at midday UTC before formatting, like every other calendar date that crosses into a
 * screen — letting the runtime pick a timezone would pull a period starting on the 1st back into
 * the month before it, on exactly the machines nobody tests on.
 */
export function countTitle(
	periodStart: CalendarDate,
	periodEnd: CalendarDate,
	locale: string
): string {
	const from = monthName(periodStart, locale);
	const to = monthName(periodEnd, locale);

	return `Stock count · ${from === to ? from : `${from} to ${to}`}`;
}

function monthName(date: CalendarDate, locale: string): string {
	return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
		month: 'long',
		timeZone: 'UTC'
	});
}

/**
 * WHY A QUANTITY CHANGED, in the words a person would use.
 *
 * The detail screen's history has one of these per row. The enum is a storage decision; this is
 * what a joiner reads when they are trying to work out where four boards went.
 *
 * `note` carries the specific — a document number on a consumption, the person's own words on a
 * correction — and is appended when there is one, so "Used on a quote" becomes "Used on quote
 * QT-1036" without a second vocabulary.
 */
export function movementReasonCopy(reason: MovementReason, note: string | null): string {
	const base = REASON_WORDS[reason];
	return note ? `${base} · ${note}` : base;
}

const REASON_WORDS: Readonly<Record<MovementReason, string>> = Object.freeze({
	opening: 'Opening balance',
	purchase: 'Received',
	stock_count: 'Adjusted after a stock count',
	quote: 'Used on a quote',
	invoice: 'Used on an invoice',
	correction: 'Corrected by hand'
});

/**
 * The detail screen's one-line statement of where an item stands.
 *
 * "12 on hand in Rack A. Reorder at 20." — the quantity, the place, and the point it is measured
 * against, which is the whole of what the header has to say. An item with no home says so rather
 * than inventing one.
 */
export function standingSentence(
	item: InventoryItem,
	onHand: Quantity,
	locationName: string | null
): string {
	const where = locationName ? ` in ${locationName}` : '';
	const unit = item.unitOfMeasure ? ` ${item.unitOfMeasure}` : '';
	return `${formatQty(onHand)}${unit} on hand${where}. Reorder at ${formatQty(item.reorderPoint)}.`;
}

/**
 * THE TWO EMPTY STATES, WHICH ARE NOT THE SAME STATE.
 *
 * SPA-6 makes this an acceptance criterion, and the difference is real: a module with no items
 * needs a way out of itself, and a filter that matched nothing needs no action at all. Offering
 * "New item" under an empty "Running low" tab would be the interface misreading good news as a
 * lack.
 */
export function emptyCopy(filter: 'all' | 'low' | 'archived'): string {
	switch (filter) {
		case 'all':
			return 'Nothing in stock yet. Add your first item and its quantity will follow every movement from here on.';
		case 'low':
			return 'Nothing running low. That is usually good news.';
		case 'archived':
			return 'Nothing archived.';
	}
}
