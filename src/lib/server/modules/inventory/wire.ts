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
import {
	about,
	checkQuantity,
	checkUnitPrice,
	invalid,
	problem,
	type Problem
} from '$lib/core/validation';
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
