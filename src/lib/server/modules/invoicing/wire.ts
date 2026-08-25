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
 *
 * WHAT THE RULES SAY WHEN THEY FIRE
 * ---------------------------------
 * The words come from `$lib/core/validation`, not from here — the same move `quoting/wire.ts`
 * makes and for the same reason: this file used to answer with `We couldn't save: ${path}
 * ${message}`, and a person recording a payment should never read the word `amountCents`. The
 * rules are unchanged; only how a refusal is expressed. `receivedOn` and `dueDate` hand their
 * copy to `explainDate`, which can tell somebody that February has 28 days in 2026 and offer
 * them the 28th.
 */
import { z } from 'zod';
import { MAX_CENTS } from '$lib/core/money';
import { check, explainDate, type Checked, type Vocabulary } from '$lib/core/validation';
import { TAX_TREATMENTS, isCalendarDate } from '$lib/core/quoting';
import { PAYMENT_METHODS } from '$lib/core/invoicing';
import type { InvoicePatch, PaymentInput } from '$lib/core/invoicing/wire';

/** Long enough for anything a person types, short enough not to be storage. */
const DESCRIPTION_MAX = 2_000;
const NAME_MAX = 200;

// No message on `.int()` on purpose: these integers are produced by the browser's parsers and
// never typed, so "something here is out of date" is truer than a sentence about whole numbers.
const exactInteger = z
	.number()
	.int()
	.min(-MAX_CENTS, 'That number is too large for us to keep exact')
	.max(MAX_CENTS, 'That number is too large for us to keep exact');

/** Trim, and read an empty string as absent. A cleared field means "no value", not "". */
const optionalText = (max: number) =>
	z
		.string()
		.max(max)
		.transform((v) => v.trim())
		.transform((v) => (v === '' ? null : v))
		.nullable()
		.default(null);

// The message is the BACKSTOP, for a value `explainDate` looks at and has no quarrel with. The
// interesting cases — the 30th of February, a 13th month — are its, not this line's.
const calendarDate = z.string().refine(isCalendarDate, 'That date could not be read');

const linePatch = z.object({
	id: z.uuid(),
	position: z.number().int().min(0).max(10_000),
	description: z.string().min(1).max(DESCRIPTION_MAX),
	provenance: optionalText(DESCRIPTION_MAX),
	documentDescription: optionalText(DESCRIPTION_MAX),
	qtyE6: exactInteger.min(0, 'A quantity cannot be negative'),
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
	amountCents: exactInteger.min(1, 'A payment has to be more than nothing'),
	receivedOn: calendarDate,
	method: z.enum(PAYMENT_METHODS),
	reference: optionalText(NAME_MAX)
});

export const cancelSchema = z.object({
	reason: optionalText(DESCRIPTION_MAX)
});

/**
 * THE WORDS THIS BOUNDARY LENDS THE STANDARD.
 *
 * `quoting/wire.ts`'s list plus the payment's own. Fields a person never types — ids, positions
 * — are deliberately absent, because a message that names one is a message about our code.
 */
const WORDS: Vocabulary = {
	rows: { lines: 'Line' },
	fields: {
		description: 'A description',
		documentDescription: 'A description',
		provenance: 'A note',
		name: 'A name',
		contactPerson: 'A contact name',
		email: 'An email address',
		sendToEmail: 'An email address',
		phone: 'A phone number',
		vatNumber: 'A VAT number',
		dueDate: 'The due date',
		receivedOn: 'The date it was received',
		reference: 'A reference',
		qtyE6: 'A quantity',
		unitPriceMicros: 'A price',
		amountCents: 'A payment'
	},
	explain: { dueDate: explainDate, receivedOn: explainDate }
};

/**
 * Parse, or say what is wrong in language somebody can act on.
 *
 * A result rather than a throw, because the caller is an autosave endpoint and the right answer
 * to "this quantity is not a number" is a message on that field — not a 500 and a save indicator
 * stuck on "saving…" forever.
 *
 * `Checked` carries the problems as well as the sentence, so the editor can put a message on the
 * line it belongs to rather than at the top of the document.
 */
export type Parsed<T> = Checked<T>;

export function parseInvoicePatch(input: unknown): Parsed<InvoicePatch> {
	return check(invoicePatchSchema, input, WORDS);
}

export function parsePayment(input: unknown): Parsed<PaymentInput> {
	return check(paymentSchema, input, WORDS);
}
