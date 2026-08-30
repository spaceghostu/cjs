/**
 * WHAT THE EDITOR IS HOLDING WHILE SOMEBODY TYPES.
 *
 * A quote in the database is exact integers. A quote being typed is TEXT — half-finished text,
 * "24 8", "1 250,", "", text that is not yet a number and may never be. The two are different
 * things and this file is the boundary between them.
 *
 * Keeping the editor's state as strings is not laziness. The alternative — parse on every
 * keystroke and store a number — means the field fights the person typing into it: a cleared
 * field becomes 0, a trailing comma disappears, "1 250," snaps to "1250". Everyone has used
 * that form. So the text is the state, and parsing happens where an answer is actually needed:
 * in the preview, and in the payload.
 *
 * PURE, AND THEREFORE TESTABLE. No runes, no DOM, no fetch. `state.svelte.ts` owns the
 * reactive shell around it and this owns every decision it makes.
 */
import {
	parseQuantityInput,
	parseRateInput,
	parseUnitPriceInput,
	type Money,
	type Quantity,
	type Rate,
	type TaxTreatment,
	type UnitPrice
} from '$lib/core/money';
import { parseMoneyInput } from '$lib/core/money';
import type { DraftPatch, LinePatch } from './wire';
import type { CalendarDate, DepositTerms, Quote, QuoteLine } from './types';

/** One row of the editor's table, as typed. */
export type EditorLine = {
	id: string;
	description: string;
	provenance: string | null;
	documentDescription: string | null;
	/** As typed. "2", "2,5", "" — never a number. */
	qty: string;
	/** As typed. "24 800", "1 250,50", "". */
	unitPrice: string;
	taxTreatment: TaxTreatment;
	sourceItemId: string | null;
};

export type EditorDeposit = {
	kind: 'none' | 'rate' | 'amount';
	/** "50" — a percentage, as typed. */
	rate: string;
	/** "24 380,00" — an amount, as typed. */
	amount: string;
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
	validUntil: string;
	deposit: EditorDeposit;
	lines: EditorLine[];
};

/** Null becomes "" on the way in, and "" becomes null on the way out. One rule, both ways. */
const text = (value: string | null): string => value ?? '';
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Quantity and price, back to the shape a person would have typed them in. */
function qtyText(qty: Quantity): string {
	// `formatQty` renders a whole number as a whole number, which is what a field should show:
	// nobody typed "1,000000".
	return qty.e6 === 0 ? '' : formatQtyForField(qty);
}

function formatQtyForField(qty: Quantity): string {
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

function depositFrom(terms: DepositTerms): EditorDeposit {
	switch (terms.kind) {
		case 'none':
			return { kind: 'none', rate: '', amount: '' };
		case 'rate':
			return { kind: 'rate', rate: ppmToPercentText(terms.rate), amount: '' };
		case 'amount':
			return { kind: 'amount', rate: '', amount: centsToText(terms.amount) };
	}
}

/** 500 000 ppm -> "50". Trailing zeros dropped: nobody wrote "50,0000%". */
function ppmToPercentText(rate: Rate): string {
	const whole = (rate.ppm - (rate.ppm % 10_000)) / 10_000;
	const frac = rate.ppm % 10_000;
	if (frac === 0) return String(whole);
	return `${whole},${String(frac).padStart(4, '0').replace(/0+$/, '')}`;
}

function centsToText(amount: Money): string {
	const negative = amount.cents < 0;
	const magnitude = negative ? -amount.cents : amount.cents;
	const whole = (magnitude - (magnitude % 100)) / 100;
	const frac = magnitude % 100;
	return `${negative ? '-' : ''}${whole},${String(frac).padStart(2, '0')}`;
}

/** A saved quote, opened for editing. */
export function editorFromQuote(quote: Quote): EditorState {
	return {
		customerId: quote.customer.customerId,
		name: text(quote.customer.name),
		contactPerson: text(quote.customer.contactPerson),
		email: text(quote.customer.email),
		phone: text(quote.customer.phone),
		vatNumber: text(quote.customer.vatNumber),
		addressLine1: text(quote.customer.addressLine1),
		addressLine2: text(quote.customer.addressLine2),
		city: text(quote.customer.city),
		postalCode: text(quote.customer.postalCode),
		sendToName: text(quote.sendTo.name),
		sendToEmail: text(quote.sendTo.email),
		validUntil: text(quote.validUntil),
		deposit: depositFrom(quote.deposit),
		lines: quote.lines.map((l) => ({
			id: l.id,
			description: l.description,
			provenance: l.provenance,
			documentDescription: l.documentDescription,
			qty: qtyText(l.qty),
			unitPrice: priceText(l.unitPrice),
			taxTreatment: l.taxTreatment,
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
		sourceItemId: null
	};
}

/**
 * A row picked from Inventory. A SNAPSHOT, not a link.
 *
 * Everything the item contributes is copied onto the line at this moment: repricing the item
 * later must never touch a quote already made. Typed structurally rather than importing
 * `$lib/core/inventory`, so quoting's core stays self-contained — the shape is the part of
 * `PickableItem` this function actually reads.
 *
 * `documentDescription` stays null DELIBERATELY. It prints verbatim on the client-facing
 * document and no quoting surface can edit or clear it, so copying `item.description` would
 * put unremovable third-hand text on a client's document; provenance already records origin.
 *
 * The provenance line carries the item's unit ("· per board") because a quote line has no
 * unit column — `qty` is millionths of whatever the line describes, and without the unit a
 * per-board price is ambiguous. "each" is compared exactly against the schema's default
 * literal by design: unit is free text, and "Each" earning a redundant suffix is honest.
 *
 * The `id` MUST be freshly minted per pick. `reconcileLines`' conflict-update path never
 * writes `sourceItemId`/`sourceCapturedAt`, so provenance is recorded only when the line
 * INSERTS — reusing an id would save the pick as an edit and lose the capture time.
 *
 * And one invariant for whoever dereferences `sourceItemId` later: it is an unverified client
 * claim that may be any uuid, including another tenant's real item id. Any future lookup
 * (SPA-9's cost, say) must run under a tenant-scoped Tx so RLS voids foreign ids — never
 * under `unsafeDb`.
 */
export function lineFromItem(
	item: {
		readonly id: string;
		readonly name: string;
		readonly unitOfMeasure: string;
		readonly sellPrice: UnitPrice | null;
	},
	id: string
): EditorLine {
	const perUnit = item.unitOfMeasure === 'each' ? '' : ` · per ${item.unitOfMeasure}`;

	return {
		id,
		description: item.name,
		provenance: `From Inventory · ${item.name}${perUnit}`,
		documentDescription: null,
		qty: '1',
		// `priceText` renders zero micros as '' — a zero sell price prefills nothing, the same
		// "absent is not zero" stance the item's own nullable column takes.
		unitPrice: item.sellPrice === null ? '' : priceText(item.sellPrice),
		taxTreatment: 'standard',
		sourceItemId: item.id
	};
}

/**
 * WHAT A HALF-TYPED FIELD IS WORTH.
 *
 * An empty or unparseable quantity or price contributes ZERO to the preview rather than
 * blanking it or throwing. The preview is a live picture of a document being made, and a
 * document with one price still to be typed is a real state — the design's own resume card
 * says "3 of 5 items priced". Freezing the preview on the last valid keystroke would be
 * worse: the person would be looking at a number that is no longer what they typed.
 */
function qtyOf(input: string): Quantity {
	const parsed = parseQuantityInput(input);
	return parsed.ok ? parsed.value : ZERO_QTY;
}

function priceOf(input: string): UnitPrice {
	const parsed = parseUnitPriceInput(input);
	return parsed.ok ? parsed.value : ZERO_PRICE;
}

// Constructed through the sanctioned door rather than the constructor, because that is the
// rule and there is no reason for this file to be the exception that proves it can be broken.
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

function editorLineToQuoteLine(line: EditorLine, index: number, vatRate: Rate): QuoteLine {
	return {
		id: line.id,
		position: index,
		description: line.description,
		provenance: line.provenance,
		documentDescription: line.documentDescription,
		qty: qtyOf(line.qty),
		unitPrice: priceOf(line.unitPrice),
		taxTreatment: line.taxTreatment,
		vatRate,
		sourceItemId: line.sourceItemId
	};
}

function depositTerms(deposit: EditorDeposit): DepositTerms {
	if (deposit.kind === 'rate') {
		const parsed = parseRateInput(deposit.rate);
		return parsed.ok ? { kind: 'rate', rate: parsed.value } : { kind: 'none' };
	}
	if (deposit.kind === 'amount') {
		const parsed = parseMoneyInput(deposit.amount);
		return parsed.ok ? { kind: 'amount', amount: parsed.value } : { kind: 'none' };
	}
	return { kind: 'none' };
}

/**
 * The quote as it stands right now, for pricing and for the preview.
 *
 * `base` supplies everything the form does not own — the id, the status, the number, the
 * pricing contract this document was issued under. The form owns the rest. A quote is never
 * reconstructed from scratch in the browser, because the VAT rate and the policy are the
 * server's snapshot and not the editor's to invent.
 */
export function quoteFromEditor(base: Quote, state: EditorState): Quote {
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
		validUntil: (orNull(state.validUntil) as CalendarDate | null) ?? null,
		deposit: depositTerms(state.deposit),
		lines: state.lines.map((l, i) => editorLineToQuoteLine(l, i, base.pricing.vatRate))
	};
}

/**
 * The autosave payload.
 *
 * A line with no description is NOT sent. It is the empty row somebody clicked "Add a line"
 * to get and has not filled in, and the database refuses a blank description — so sending it
 * would turn a normal moment in editing into a failed save and a red indicator.
 */
export function patchFromEditor(state: EditorState): DraftPatch {
	const lines: LinePatch[] = state.lines
		.filter((l) => l.description.trim() !== '')
		.map((l, i) => ({
			id: l.id,
			position: i,
			description: l.description.trim(),
			provenance: l.provenance,
			documentDescription: l.documentDescription,
			qtyE6: qtyOf(l.qty).e6,
			unitPriceMicros: priceOf(l.unitPrice).micros,
			taxTreatment: l.taxTreatment,
			sourceItemId: l.sourceItemId
		}));

	const terms = depositTerms(state.deposit);

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
		validUntil: orNull(state.validUntil) as CalendarDate | null,
		deposit:
			terms.kind === 'rate'
				? { kind: 'rate', ppm: terms.rate.ppm }
				: terms.kind === 'amount'
					? { kind: 'amount', cents: terms.amount.cents }
					: { kind: 'none' },
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

export function depositIssue(deposit: EditorDeposit): string | null {
	if (deposit.kind === 'rate' && deposit.rate.trim() !== '') {
		const parsed = parseRateInput(deposit.rate);
		return parsed.ok ? null : parsed.message;
	}
	if (deposit.kind === 'amount' && deposit.amount.trim() !== '') {
		const parsed = parseMoneyInput(deposit.amount);
		return parsed.ok ? null : parsed.message;
	}
	return null;
}

/**
 * WHAT STILL HAS TO BE TRUE BEFORE A CLIENT CAN SEE THIS.
 *
 * Stated as sentences rather than as a boolean, so the Send button can say WHY it is not
 * available instead of being mysteriously grey. Every one of these is something the client
 * would notice: no client, nowhere to send it, nothing on it.
 */
export function blockersToSending(state: EditorState): readonly string[] {
	const blockers: string[] = [];

	if (!state.customerId) blockers.push('Choose the client this quote is for.');
	if (!orNull(state.sendToEmail)) blockers.push('Add an email address to send it to.');
	if (state.lines.every((l) => l.description.trim() === '')) {
		blockers.push('Add at least one line.');
	}

	return blockers;
}

/**
 * The customer fields that differ from the address book.
 *
 * "Change it here and we'll ask if you want it saved" — this is the ASK. A field is offered
 * for promotion only when it actually differs, so somebody who changed nothing is never
 * interrupted.
 */
export type FieldDifference = {
	readonly field: string;
	readonly label: string;
	readonly was: string | null;
	readonly now: string | null;
};

const PROMOTABLE_LABELS: readonly (readonly [keyof EditorState & string, string])[] = [
	['name', 'Client name'],
	['contactPerson', 'Contact person'],
	['email', 'Email'],
	['phone', 'Phone'],
	['vatNumber', 'VAT number'],
	['addressLine1', 'Address'],
	['addressLine2', 'Address line 2'],
	['city', 'City'],
	['postalCode', 'Postal code']
];

export function differencesFromRecord(
	state: EditorState,
	record: Readonly<Record<string, string | null>>
): readonly FieldDifference[] {
	return PROMOTABLE_LABELS.flatMap(([field, label]) => {
		const now = orNull(String(state[field] ?? ''));
		const was = record[field] ?? null;
		return now === was ? [] : [{ field, label, was, now }];
	});
}
