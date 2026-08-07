/**
 * THE BOUNDARY.
 *
 * Everything the editor sends arrives here first. Nothing downstream — not `effects.ts`, not
 * a column, not `priceDocument` — sees a value this file has not already refused to let
 * through.
 *
 * The rules are not decoration:
 *
 *   - `qtyE6` and `unitPriceMicros` are checked as SAFE INTEGERS in range. A value past
 *     `MAX_CENTS` has stopped being money and become a silently-wrong number; `db/map.ts`
 *     would throw on it and the database CHECK would refuse it, and catching it here is the
 *     difference between a field-level message and a 500.
 *   - `taxTreatment` is a closed union. A line that arrived claiming an unknown treatment
 *     would fall through `priceDocument`'s grouping into a bucket nobody meant.
 *   - `validUntil` is a real calendar day. `2026-02-30` matches `\d{4}-\d{2}-\d{2}` and is not
 *     a date.
 *   - Text is bounded. A description is a description; nothing here needs a megabyte, and an
 *     unbounded text column reachable from an unauthenticated-adjacent surface is a way to
 *     fill somebody's disk.
 */
import { z } from 'zod';
import { MAX_CENTS } from '$lib/core/money';
import { PROMOTABLE_FIELDS, TAX_TREATMENTS, isCalendarDate } from '$lib/core/quoting';
import type { DraftPatch } from '$lib/core/quoting/wire';

/** Long enough for anything a person types, short enough not to be storage. */
const DESCRIPTION_MAX = 2_000;
const NAME_MAX = 200;

const exactInteger = z
	.number()
	.int('must be a whole number')
	.min(-MAX_CENTS, 'is too large to be exact')
	.max(MAX_CENTS, 'is too large to be exact');

/** Trim, and read an empty string as absent. A cleared field means "no value", not "". */
const optionalText = (max: number) =>
	z
		.string()
		.max(max)
		.transform((v) => v.trim())
		.transform((v) => (v === '' ? null : v))
		.nullable()
		.default(null);

const calendarDate = z
	.string()
	.refine(isCalendarDate, 'is not a real date')
	.nullable()
	.default(null);

const linePatch = z.object({
	id: z.uuid(),
	position: z.number().int().min(0).max(10_000),
	description: z.string().min(1, 'needs a description').max(DESCRIPTION_MAX),
	provenance: optionalText(DESCRIPTION_MAX),
	documentDescription: optionalText(DESCRIPTION_MAX),
	qtyE6: exactInteger.min(0, 'cannot be negative'),
	unitPriceMicros: exactInteger,
	taxTreatment: z.enum(TAX_TREATMENTS),
	sourceItemId: z.uuid().nullable().default(null)
});

const customerPatch = z.object({
	name: optionalText(NAME_MAX),
	contactPerson: optionalText(NAME_MAX),
	// Not `z.email()`: this is what PRINTS on a document, and a business whose client uses an
	// address our validator dislikes must still be able to quote them. The address that has to
	// be deliverable is `sendToEmail`, which is checked where it is used — at send.
	email: optionalText(NAME_MAX),
	phone: optionalText(NAME_MAX),
	vatNumber: optionalText(NAME_MAX),
	addressLine1: optionalText(NAME_MAX),
	addressLine2: optionalText(NAME_MAX),
	city: optionalText(NAME_MAX),
	postalCode: optionalText(NAME_MAX)
});

const depositPatch = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('none') }),
	// 0 to 1 000 000 ppm — 0% to 100%. A deposit larger than the quote is not a deposit.
	z.object({ kind: z.literal('rate'), ppm: z.number().int().min(0).max(1_000_000) }),
	z.object({ kind: z.literal('amount'), cents: exactInteger.min(0) })
]);

export const draftPatchSchema = z.object({
	customerId: z.uuid().nullable().default(null),
	customer: customerPatch,
	sendToName: optionalText(NAME_MAX),
	sendToEmail: optionalText(NAME_MAX),
	validUntil: calendarDate,
	deposit: depositPatch,
	// A cap, so one request cannot ask for ten thousand INSERTs. Well past any real quote.
	lines: z.array(linePatch).max(200)
});

export const promoteSchema = z.object({
	fields: z.array(z.enum(PROMOTABLE_FIELDS)).min(1).max(PROMOTABLE_FIELDS.length)
});

/**
 * Parse, or say what is wrong in language somebody can act on.
 *
 * Returns a result rather than throwing, because the caller is an autosave endpoint and the
 * right answer to "this quantity is not a number" is a message on that field — not a 500 and
 * a save indicator stuck on "saving…" forever.
 */
export type ParsedPatch =
	| { readonly ok: true; readonly patch: DraftPatch }
	| { readonly ok: false; readonly message: string };

export function parseDraftPatch(input: unknown): ParsedPatch {
	const result = draftPatchSchema.safeParse(input);
	if (result.success) return { ok: true, patch: result.data };

	const first = result.error.issues[0];
	const where = first.path.join('.') || 'that';
	return { ok: false, message: `We couldn't save: ${where} ${first.message}.` };
}
