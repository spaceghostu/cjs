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
 */
import { parseQuantityInput, parseUnitPriceInput } from '$lib/core/money';
import type { ItemInput } from './effects';

export type ParsedItem =
	| { readonly ok: true; readonly value: ItemInput; readonly openingQtyE6: number }
	| { readonly ok: false; readonly message: string };

function text(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * An optional price. Blank is NOT zero — "we have not recorded what this costs" is a real state,
 * and storing a zero would put a free board into the valuation.
 */
function optionalMicros(
	raw: string,
	what: string
): { ok: true; value: number | null } | { ok: false; message: string } {
	if (raw === '') return { ok: true, value: null };
	const parsed = parseUnitPriceInput(raw);
	if (!parsed.ok) return { ok: false, message: `${what}: ${parsed.message}` };
	return { ok: true, value: parsed.value.micros };
}

/** An optional quantity. Blank means none, which for a reorder point means "never tell me". */
function optionalQty(
	raw: string,
	what: string
): { ok: true; value: number } | { ok: false; message: string } {
	if (raw === '') return { ok: true, value: 0 };
	const parsed = parseQuantityInput(raw);
	if (!parsed.ok) return { ok: false, message: `${what}: ${parsed.message}` };
	if (parsed.value.e6 < 0) return { ok: false, message: `${what} cannot be a negative number.` };
	return { ok: true, value: parsed.value.e6 };
}

export function parseItemForm(form: FormData): ParsedItem {
	const name = text(form, 'name');
	if (!name) return { ok: false, message: 'An item needs a name before it can be saved.' };

	const cost = optionalMicros(text(form, 'cost'), 'What it costs you');
	if (!cost.ok) return { ok: false, message: cost.message };

	const sell = optionalMicros(text(form, 'sell'), 'What you sell it for');
	if (!sell.ok) return { ok: false, message: sell.message };

	const reorder = optionalQty(text(form, 'reorderPoint'), 'The reorder point');
	if (!reorder.ok) return { ok: false, message: reorder.message };

	const opening = optionalQty(text(form, 'openingQty'), 'How many you have');
	if (!opening.ok) return { ok: false, message: opening.message };

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
