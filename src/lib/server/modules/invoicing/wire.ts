/**
 * THE BOUNDARY.
 *
 * Everything the editor and the payment dialog send arrives here first. Nothing downstream —
 * not `effects.ts`, not a column, not `priceDocument`, not the ledger — sees a value this file
 * has not already refused to let through.
 *
 * The rules are `quoting/wire.ts`'s, plus the two an invoice adds:
 *
 *   - `amountCents` on a payment is POSITIVE. The direction of money is not the client's to
 *     choose: a negative "payment" would be a reversal that dodged the thirty-day window.
 *   - `noCharge` is sent explicitly rather than inferred from a zero price, because a line
 *     nobody has priced yet is also zero and the two mean opposite things.
 */
import { z } from 'zod';
import { MAX_CENTS } from '$lib/core/money';
import { TAX_TREATMENTS, isCalendarDate } from '$lib/core/quoting';
import { PAYMENT_METHODS } from '$lib/core/invoicing';
import type { InvoicePatch, PaymentInput } from '$lib/core/invoicing/wire';

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

const calendarDate = z.string().refine(isCalendarDate, 'is not a real date');

const linePatch = z.object({
	id: z.uuid(),
	position: z.number().int().min(0).max(10_000),
	description: z.string().min(1, 'needs a description').max(DESCRIPTION_MAX),
	provenance: optionalText(DESCRIPTION_MAX),
	documentDescription: optionalText(DESCRIPTION_MAX),
	qtyE6: exactInteger.min(0, 'cannot be negative'),
	unitPriceMicros: exactInteger,
	taxTreatment: z.enum(TAX_TREATMENTS),
	noCharge: z.boolean().default(false),
	sourceItemId: z.uuid().nullable().default(null)
});

const customerPatch = z.object({
	name: optionalText(NAME_MAX),
	contactPerson: optionalText(NAME_MAX),
	// Not `z.email()`: this is what PRINTS on a document, and a business whose client uses an
	// address our validator dislikes must still be able to bill them. The address that has to be
	// deliverable is `sendToEmail`, which is checked where it is used — at issue.
	email: optionalText(NAME_MAX),
	phone: optionalText(NAME_MAX),
	vatNumber: optionalText(NAME_MAX),
	addressLine1: optionalText(NAME_MAX),
	addressLine2: optionalText(NAME_MAX),
	city: optionalText(NAME_MAX),
	postalCode: optionalText(NAME_MAX)
});

export const invoicePatchSchema = z.object({
	customerId: z.uuid().nullable().default(null),
	customer: customerPatch,
	sendToName: optionalText(NAME_MAX),
	sendToEmail: optionalText(NAME_MAX),
	dueDate: calendarDate.nullable().default(null),
	// A cap, so one request cannot ask for ten thousand INSERTs. Well past any real invoice.
	lines: z.array(linePatch).max(200)
});

/**
 * Recording a payment.
 *
 * The amount is positive and bounded, the date is a real day, and the method is one of five.
 * A payment is the one thing on this screen that moves money in the ledger, so it gets the
 * strictest shape in the module.
 */
export const paymentSchema = z.object({
	amountCents: exactInteger.min(1, 'must be more than nothing'),
	receivedOn: calendarDate,
	method: z.enum(PAYMENT_METHODS),
	reference: optionalText(NAME_MAX)
});

export const cancelSchema = z.object({
	reason: optionalText(DESCRIPTION_MAX)
});

/**
 * Parse, or say what is wrong in language somebody can act on.
 *
 * A result rather than a throw, because the caller is an autosave endpoint and the right answer
 * to "this quantity is not a number" is a message on that field — not a 500 and a save indicator
 * stuck on "saving…" forever.
 */
export type Parsed<T> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

function parse<T>(schema: z.ZodType<T>, input: unknown, verb: string): Parsed<T> {
	const result = schema.safeParse(input);
	if (result.success) return { ok: true, value: result.data };

	const first = result.error.issues[0];
	const where = first.path.join('.') || 'that';
	return { ok: false, message: `We couldn't ${verb}: ${where} ${first.message}.` };
}

export function parseInvoicePatch(input: unknown): Parsed<InvoicePatch> {
	return parse(invoicePatchSchema, input, 'save');
}

export function parsePayment(input: unknown): Parsed<PaymentInput> {
	return parse(paymentSchema, input, 'record that payment');
}
