/**
 * WHAT THE INVOICE EDITOR IS HOLDING WHILE SOMEBODY TYPES.
 *
 * An invoice in the database is exact integers. An invoice being typed is TEXT — half-finished
 * text, "16 4", "2 300,", "", text that is not yet a number and may never be. The two are
 * different things and this file is the boundary between them, exactly as `quoting/editor.ts` is
 * for the other module.
 *
 * Keeping the editor's state as strings is not laziness. Parse-on-every-keystroke means the
 * field fights the person typing into it: a cleared field becomes 0, a trailing comma
 * disappears, "2 300," snaps to "2300". So the text is the state, and parsing happens where an
 * answer is actually needed — in the preview, and in the payload.
 *
 * WHAT AN INVOICE'S EDITOR DOES NOT HAVE
 * -------------------------------------
 * No deposit terms and no validity: neither is a thing an invoice says. What it has instead is a
 * DUE DATE, and one field a quote has no use for — `noCharge`, the design's `±0.00`, which is
 * the difference between "included, no charge" and "nobody has priced this yet".
 *
 * PURE, AND THEREFORE TESTABLE. No runes, no DOM, no fetch.
 */
import {
	parseQuantityInput,
	parseUnitPriceInput,
	type Quantity,
	type Rate,
	type TaxTreatment,
	type UnitPrice
} from '$lib/core/money';
import type { CalendarDate } from '$lib/core/calendar';
import type { Invoice, InvoiceLine } from './types';
import type { InvoicePatch, LinePatch } from './wire';

/** One row of the editor's table, as typed. */
export type EditorLine = {
	id: string;
	description: string;
	provenance: string | null;
	documentDescription: string | null;
	/** As typed. "2", "2,5", "" — never a number. */
	qty: string;
	/** As typed. "16 400", "2 300,50", "". */
	unitPrice: string;
	taxTreatment: TaxTreatment;
	/** Included, no charge. A deliberate zero, which is not the same as an empty price. */
	noCharge: boolean;
	sourceItemId: string | null;
};

export type EditorState = {
	customerId: string | null;
	name: string;
	contactPerson: string;
	email: string;
	phone: string;
	vatNumber: string;
	addressLine1: string;
	addressLine2: string;
	city: string;
	postalCode: string;
	sendToName: string;
	sendToEmail: string;
	dueDate: string;
	lines: EditorLine[];
};

/** Null becomes "" on the way in, and "" becomes null on the way out. One rule, both ways. */
const text = (value: string | null): string => value ?? '';
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Quantity and price, back to the shape a person would have typed them in. */
function qtyText(qty: Quantity): string {
	if (qty.e6 === 0) return '';
	const whole = (qty.e6 - (qty.e6 % 1_000_000)) / 1_000_000;
	const frac = qty.e6 % 1_000_000;
	if (frac === 0) return String(whole);
	return `${whole},${String(frac).padStart(6, '0').replace(/0+$/, '')}`;
}

function priceText(price: UnitPrice): string {
	if (price.micros === 0) return '';
	const negative = price.micros < 0;
	const magnitude = negative ? -price.micros : price.micros;
	const whole = (magnitude - (magnitude % 1_000_000)) / 1_000_000;
	const frac = magnitude % 1_000_000;
	const body =
		frac === 0 ? String(whole) : `${whole},${String(frac).padStart(6, '0').replace(/0+$/, '')}`;
	return negative ? `-${body}` : body;
}

/** A saved invoice, opened for editing. */
export function editorFromInvoice(invoice: Invoice): EditorState {
	return {
		customerId: invoice.customer.customerId,
		name: text(invoice.customer.name),
		contactPerson: text(invoice.customer.contactPerson),
		email: text(invoice.customer.email),
		phone: text(invoice.customer.phone),
		vatNumber: text(invoice.customer.vatNumber),
		addressLine1: text(invoice.customer.addressLine1),
		addressLine2: text(invoice.customer.addressLine2),
		city: text(invoice.customer.city),
		postalCode: text(invoice.customer.postalCode),
		sendToName: text(invoice.sendTo.name),
		sendToEmail: text(invoice.sendTo.email),
		dueDate: text(invoice.dueDate),
		lines: invoice.lines.map((l) => ({
			id: l.id,
			description: l.description,
			provenance: l.provenance,
			documentDescription: l.documentDescription,
			qty: qtyText(l.qty),
			unitPrice: priceText(l.unitPrice),
			taxTreatment: l.taxTreatment,
			noCharge: l.noCharge,
			sourceItemId: l.sourceItemId
		}))
	};
}

/** An empty row. A new line starts at quantity 1, because almost every line is one of a thing. */
export function blankLine(id: string): EditorLine {
	return {
		id,
		description: '',
		provenance: null,
		documentDescription: null,
		qty: '1',
		unitPrice: '',
		taxTreatment: 'standard',
		noCharge: false,
		sourceItemId: null
	};
}

/**
 * WHAT A HALF-TYPED FIELD IS WORTH.
 *
 * An empty or unparseable quantity or price contributes ZERO to the preview rather than blanking
 * it or throwing. The preview is a live picture of a document being made, and a document with
 * one price still to be typed is a real state. Freezing the preview on the last valid keystroke
 * would be worse: the person would be looking at a number that is no longer what they typed.
 */
function qtyOf(input: string): Quantity {
	const parsed = parseQuantityInput(input);
	return parsed.ok ? parsed.value : ZERO_QTY;
}

function priceOf(input: string): UnitPrice {
	const parsed = parseUnitPriceInput(input);
	return parsed.ok ? parsed.value : ZERO_PRICE;
}

// Constructed through the sanctioned door rather than the constructor, because that is the rule
// and there is no reason for this file to be the exception that proves it can be broken.
const ZERO_QTY = (() => {
	const parsed = parseQuantityInput('0');
	/* v8 ignore next -- "0" parses; the branch exists so the type is not an assertion */
	if (!parsed.ok) throw new Error('unreachable: "0" is a quantity');
	return parsed.value;
})();

const ZERO_PRICE = (() => {
	const parsed = parseUnitPriceInput('0');
	/* v8 ignore next -- "0" parses; the branch exists so the type is not an assertion */
	if (!parsed.ok) throw new Error('unreachable: "0" is a price');
	return parsed.value;
})();

function editorLineToInvoiceLine(line: EditorLine, index: number, vatRate: Rate): InvoiceLine {
	return {
		id: line.id,
		position: index,
		description: line.description,
		provenance: line.provenance,
		documentDescription: line.documentDescription,
		qty: qtyOf(line.qty),
		// A no-charge line is zero whatever the field says. The flag is the decision; the field
		// is disabled behind it, and this is what makes that true of the numbers as well as of
		// the interface.
		unitPrice: line.noCharge ? ZERO_PRICE : priceOf(line.unitPrice),
		taxTreatment: line.taxTreatment,
		vatRate,
		noCharge: line.noCharge,
		sourceItemId: line.sourceItemId,
		// The editor never sets a cost. It is snapshotted server-side when a line is drawn from
		// Inventory, and a browser that could supply one could rewrite the margin panel.
		cost: null,
		costSource: null
	};
}

/**
 * The invoice as it stands right now, for pricing and for the preview.
 *
 * `base` supplies everything the form does not own — the id, the status, the number, the pricing
 * contract this document was issued under. An invoice is never reconstructed from scratch in the
 * browser, because the VAT rate and the policy are the server's snapshot and not the editor's to
 * invent.
 */
export function invoiceFromEditor(base: Invoice, state: EditorState): Invoice {
	return {
		...base,
		customer: {
			customerId: state.customerId,
			name: orNull(state.name),
			contactPerson: orNull(state.contactPerson),
			email: orNull(state.email),
			phone: orNull(state.phone),
			vatNumber: orNull(state.vatNumber),
			addressLine1: orNull(state.addressLine1),
			addressLine2: orNull(state.addressLine2),
			city: orNull(state.city),
			postalCode: orNull(state.postalCode),
			country: base.customer.country
		},
		sendTo: { name: orNull(state.sendToName), email: orNull(state.sendToEmail) },
		dueDate: (orNull(state.dueDate) as CalendarDate | null) ?? null,
		lines: state.lines.map((l, i) => editorLineToInvoiceLine(l, i, base.pricing.vatRate))
	};
}

/**
 * The autosave payload.
 *
 * A line with no description is NOT sent. It is the empty row somebody clicked "Add a line" to
 * get and has not filled in, and the database refuses a blank description — so sending it would
 * turn a normal moment in editing into a failed save and a red indicator.
 */
export function patchFromEditor(state: EditorState): InvoicePatch {
	const lines: LinePatch[] = state.lines
		.filter((l) => l.description.trim() !== '')
		.map((l, i) => ({
			id: l.id,
			position: i,
			description: l.description.trim(),
			provenance: l.provenance,
			documentDescription: l.documentDescription,
			qtyE6: qtyOf(l.qty).e6,
			unitPriceMicros: l.noCharge ? 0 : priceOf(l.unitPrice).micros,
			taxTreatment: l.taxTreatment,
			noCharge: l.noCharge,
			sourceItemId: l.sourceItemId
		}));

	return {
		customerId: state.customerId,
		customer: {
			name: orNull(state.name),
			contactPerson: orNull(state.contactPerson),
			email: orNull(state.email),
			phone: orNull(state.phone),
			vatNumber: orNull(state.vatNumber),
			addressLine1: orNull(state.addressLine1),
			addressLine2: orNull(state.addressLine2),
			city: orNull(state.city),
			postalCode: orNull(state.postalCode)
		},
		sendToName: orNull(state.sendToName),
		sendToEmail: orNull(state.sendToEmail),
		dueDate: orNull(state.dueDate) as CalendarDate | null,
		lines
	};
}

/** A field-level complaint, or null. What the editor puts under an input. */
export function qtyIssue(input: string): string | null {
	if (input.trim() === '') return null;
	const parsed = parseQuantityInput(input);
	return parsed.ok ? null : parsed.message;
}

export function priceIssue(input: string): string | null {
	if (input.trim() === '') return null;
	const parsed = parseUnitPriceInput(input);
	return parsed.ok ? null : parsed.message;
}

/**
 * WHY THIS INVOICE CANNOT BE ISSUED YET.
 *
 * Every reason at once rather than the first one, so the button can say what is actually
 * missing instead of revealing one problem per attempt.
 *
 * A line at zero is NOT a blocker when it is flagged no-charge — that is the design's "Fitting
 * and finishing · ±0.00", a deliberate inclusion. It IS a blocker otherwise, because an
 * unpriced line on a document a client is about to be asked to pay is almost always a mistake
 * somebody would want caught.
 */
export function blockersToIssuing(state: EditorState): readonly string[] {
	const blockers: string[] = [];

	if (!state.customerId) blockers.push('Choose the client this invoice is for.');
	if (orNull(state.sendToEmail) === null) blockers.push('Add an email address to send it to.');
	if (orNull(state.dueDate) === null) blockers.push('Set a due date.');

	const lines = state.lines.filter((l) => l.description.trim() !== '');
	if (lines.length === 0) blockers.push('Add at least one line.');

	const unpriced = lines.filter((l) => !l.noCharge && priceOf(l.unitPrice).micros === 0);
	if (unpriced.length > 0) {
		blockers.push(
			unpriced.length === 1
				? `"${unpriced[0].description.trim()}" has no price. Mark it as included if that is deliberate.`
				: `${unpriced.length} lines have no price. Mark them as included if that is deliberate.`
		);
	}

	return blockers;
}
