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
 * THE THREE EMPTY STATES, WHICH ARE NOT THE SAME STATE.
 *
 * SPA-6 makes the distinction an acceptance criterion, and it is real: a module with no items
 * needs a way out of itself, and a filter that matched nothing needs no action at all. Offering
 * "New item" under an empty "Running low" tab would be the interface misreading good news as a
 * lack.
 *
 * THE THIRD ONE IS EASY TO MISS. A business that has archived everything has an empty `All` tab
 * and is NOT a first-run: telling somebody with eleven archived items to "add your first item"
 * is the interface failing to notice what they already have. `hasArchived` is what separates
 * "nothing yet" from "nothing here any more", and it points at the tab that holds the answer.
 */
export function emptyCopy(filter: 'all' | 'low' | 'archived', hasArchived = false): string {
	switch (filter) {
		case 'all':
			return hasArchived
				? 'Everything you stock is archived. Restore one from the Archived tab, or add something new.'
				: 'Nothing in stock yet. Add your first item and its quantity will follow every movement from here on.';
		case 'low':
			return 'Nothing running low. That is usually good news.';
		case 'archived':
			return 'Nothing archived.';
	}
}
