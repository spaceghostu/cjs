/**
 * WHAT ARRIVES FROM A FORM, VALIDATED.
 *
 * The browser builds an `ItemPatch`; this is where it stops being a claim. Nothing past this file
 * trusts a number that came over the network, and nothing past this file parses one either — the
 * sanctioned parsers in `$lib/core/money` are the only route from what a person typed to an exact
 * integer, and `parseFloat` is import-banned for precisely these fields.
 *
 * WHY THE MESSAGES ARE SENTENCES. They are shown verbatim to somebody who is mid-task and
 * probably not an accountant, so they say what to do rather than what went wrong: "Enter how many
 * you have, or leave it blank" rather than "invalid quantity".
 *
 * WHAT CHANGED WHEN THE STANDARD LANDED
 * -------------------------------------
 * The parsers are the same ones, called the same way. What is new is that they are reached
 * through `$lib/core/validation`, which adds the second half of the standard: where the money
 * core refuses a value because it has more decimals than the field can hold, the adapter offers
 * the value with the extra digits taken off — "A price is exact to six decimals — did you mean
 * R33,333333?" — so the repair is a click rather than a retype. The wording of every other
 * refusal is the money core's, unchanged, because it was already right.
 *
 * The failure carries `problems` as well as a sentence, each anchored to the form field it came
 * from, so the rendering layer can put a message under the input rather than at the top of the
 * dialog.
 */
import { z } from 'zod';
import {
	about,
	check,
	checkQuantity,
	checkUnitPrice,
	invalid,
	problem,
	valid,
	type Checked,
	type Problem,
	type Vocabulary
} from '$lib/core/validation';
import { COUNTED_FIELD, checkCounted } from '$lib/core/inventory';
import type { ItemInput } from './effects';

export type ParsedItem =
	| { readonly ok: true; readonly value: ItemInput; readonly openingQtyE6: number }
	| { readonly ok: false; readonly message: string; readonly problems: readonly Problem[] };

function text(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

type Field<T> = { ok: true; value: T } | { ok: false; problem: Problem };

/**
 * An optional price. Blank is NOT zero — "we have not recorded what this costs" is a real state,
 * and storing a zero would put a free board into the valuation.
 *
 * `about` is the standard's own composer — the same one that turns a line index into "Line 4" —
 * so "What it costs you: enter an amount." is capitalised and stopped by exactly one rule in
 * exactly one place, and this file holds no second opinion about punctuation.
 */
function optionalMicros(raw: string, field: string, what: string): Field<number | null> {
	if (raw === '') return { ok: true, value: null };
	const checked = checkUnitPrice(raw, field);
	if (checked.ok) return { ok: true, value: checked.value.micros };
	return { ok: false, problem: about(checked.problems[0], what) };
}

/** An optional quantity. Blank means none, which for a reorder point means "never tell me". */
function optionalQty(raw: string, field: string, what: string): Field<number> {
	if (raw === '') return { ok: true, value: 0 };

	const checked = checkQuantity(raw, field);
	if (!checked.ok) return { ok: false, problem: about(checked.problems[0], what) };

	if (checked.value.e6 < 0) {
		return {
			ok: false,
			problem: about(problem('cannot be a negative number', { field }), what)
		};
	}
	return { ok: true, value: checked.value.e6 };
}

function refuse(found: Problem): ParsedItem {
	const result = invalid(found);
	return { ok: false, message: result.message, problems: result.problems };
}

export function parseItemForm(form: FormData): ParsedItem {
	const name = text(form, 'name');
	if (!name) {
		return refuse(problem('An item needs a name before it can be saved', { field: 'name' }));
	}

	const cost = optionalMicros(text(form, 'cost'), 'cost', 'What it costs you');
	if (!cost.ok) return refuse(cost.problem);

	const sell = optionalMicros(text(form, 'sell'), 'sell', 'What you sell it for');
	if (!sell.ok) return refuse(sell.problem);

	const reorder = optionalQty(text(form, 'reorderPoint'), 'reorderPoint', 'The reorder point');
	if (!reorder.ok) return refuse(reorder.problem);

	const opening = optionalQty(text(form, 'openingQty'), 'openingQty', 'How many you have');
	if (!opening.ok) return refuse(opening.problem);

	const locationName = text(form, 'locationName');

	return {
		ok: true,
		value: {
			name,
			sku: text(form, 'sku') || null,
			description: text(form, 'description') || null,
			unit: text(form, 'unit') || 'each',
			costMicros: cost.value,
			sellMicros: sell.value,
			reorderPointE6: reorder.value,
			// The form only ever sends a NAME. Matching it to an existing place, or creating one,
			// happens server-side in `resolveLocation` so that "Rack A" and "rack a" cannot become
			// two places.
			defaultLocationId: null,
			newLocationName: locationName || null
		},
		openingQtyE6: opening.value
	};
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE COUNT SHEET'S BOUNDARY
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * A batch of counted lines, arriving from the autosave every time somebody pauses typing.
 *
 * WHAT ARRIVES IS TEXT, AND THAT IS DELIBERATE. The browser sends "14", or "1 200,5", or the
 * empty string — never an integer. Quoting sends `qtyE6` because its editor has already parsed
 * for pricing and the preview would be a lie otherwise; a count sheet has no such need, so the
 * one parser in this product gets to be the only one that ever sees these strings. A component
 * that turned "1 200,5" into 1_200_500_000 on the way out would be a second parser, in the one
 * layer that has no tests against a real database.
 *
 * `null` IS NOT `"0"`, ALL THE WAY DOWN. A blank box means "I have not looked at this one yet"
 * and `saveCountLine` stores it as SQL NULL; a typed zero means "the shelf is empty" and is a
 * finding worth money. Three layers say so — this one, the storage CHECK, and the dashed border
 * on the screen — because a promise held in only one place is held until somebody writes a
 * second caller.
 *
 * EVERY PROBLEM IS ANCHORED TO THE LINE'S OWN ID, not to `lines.3.counted`. The variance table
 * is a grid, not a stack of labelled fields, so its message is found by the row rather than by
 * the cell — see the header on `FieldError.svelte`, which is the primitive that renders it.
 */

/** Well past any real count sheet, and the same ceiling `MAX_PAGE_SIZE` puts on reading one. */
const MAX_COUNT_LINES = 500;

const countPatchSchema = z.object({
	lines: z
		.array(
			z.object({
				id: z.uuid(),
				// Bounded: a quantity is a quantity. Nothing here needs a kilobyte.
				counted: z.string().max(64).nullable()
			})
		)
		.max(MAX_COUNT_LINES)
});

/** What the count endpoint hands `saveCountLine`, once nothing is a claim any more. */
export type CountLineInput = {
	readonly id: string;
	/** Millionths of a unit, or null to un-count the line. */
	readonly countedQtyE6: number | null;
};

export type ParsedCount = Checked<{ readonly lines: readonly CountLineInput[] }>;

/**
 * The words this boundary lends the standard.
 *
 * Only one field is ever typed here, so there is only one subject to name — and it is named,
 * because "Enter a number" on its own does not say a number of what. The same subject
 * `checkCounted` uses, from the same constant, so a shape complaint and a value complaint
 * introduce themselves identically.
 */
const COUNT_WORDS: Vocabulary = { fields: { counted: COUNTED_FIELD } };

export function parseCountPatch(input: unknown): ParsedCount {
	const shape = check(countPatchSchema, input, COUNT_WORDS);
	if (!shape.ok) return shape;

	const lines: CountLineInput[] = [];

	for (const line of shape.value.lines) {
		// `checkCounted` is the SAME function the count sheet asked before it queued this line.
		// One place decides what a count box may hold, so the sentence a person reads while
		// typing and the sentence they get back from the server cannot be two different
		// sentences. `null` is a blank box: a real, chosen state, and the only way back from a
		// number typed into the wrong row.
		const checked = checkCounted(line.counted ?? '', line.id);

		if (checked === null) {
			lines.push({ id: line.id, countedQtyE6: null });
			continue;
		}
		if (!checked.ok) return checked;

		lines.push({ id: line.id, countedQtyE6: checked.value.e6 });
	}

	return valid({ lines });
}
