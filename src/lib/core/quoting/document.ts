/**
 * A QUOTE, AS PAPER.
 *
 * The projection from Quoting's model into the shared `PrintableDocument` that T17's renderer
 * takes. Everything the sheet differs on between a quote and an invoice is decided here and
 * carried as data, so `$lib/components/document` never branches on which module produced it.
 *
 * Called from three places, and that is the whole point of it existing:
 *   - the editor's live preview, in the browser, on every keystroke;
 *   - the document panel, server-rendered;
 *   - the PDF worker.
 *
 * One function, so what the business saw and what the client received cannot differ.
 */
import { formatRatePercent, type PricedDocument } from '$lib/core/money';
import type { DocumentIssuer, DocumentLine, PrintableDocument } from '$lib/core/document';
import { formatDocumentDate } from './validity';
import type { Quote, QuoteCustomer } from './types';
import type { QuotePrice } from './pricing';

/**
 * The footer a quote carries when the business has not written its own.
 *
 * Quoted from the design. It lives here rather than in the database default so that a business
 * that has never opened its quoting settings still sends a document that says the right thing,
 * and so the wording can be corrected in one place for everyone who has not overridden it.
 */
export const DEFAULT_QUOTE_FOOTER: readonly string[] = Object.freeze([
	'50% deposit to begin · balance on completion',
	'Banking details on acceptance'
]);

/**
 * "VAT 15%" — the wording the DOCUMENT uses.
 *
 * The money engine's own label is "VAT @ 15%", which is what the tax-summary block of a
 * compliant invoice wants; the design's totals stack is terser. Both are derived from the same
 * `ratePpm` through the same formatter, so the percentage itself can never disagree between
 * the two.
 *
 * A document with several rates, or with no taxed line at all, falls back to the bare word.
 * That case cannot arise from today's editor — every line carries the business's one rate —
 * and the day it can, "VAT" is the honest heading for a column that sums more than one.
 */
export function documentTaxLabel(priced: PricedDocument): string {
	const taxed = priced.groups.filter((g) => g.ratePpm !== 0);
	if (taxed.length !== 1) return 'VAT';
	return `VAT ${formatRatePercent(taxed[0].ratePpm)}%`;
}

/**
 * "VAT at 15%" — the wording the EDITOR uses.
 *
 * The design words the same figure three ways: "VAT @ 15%" in the money engine's tax-summary
 * label, "VAT 15%" on the document, "VAT at 15%" in the editor's totals column. All three are
 * derived from the same `ratePpm` through the same formatter, so the percentage itself can
 * never disagree between them — only the preposition does.
 */
export function editorTaxLabel(priced: PricedDocument): string {
	const taxed = priced.groups.filter((g) => g.ratePpm !== 0);
	if (taxed.length !== 1) return 'VAT';
	return `VAT at ${formatRatePercent(taxed[0].ratePpm)}%`;
}

/** The line beneath the client's name: the person it is addressed to, or where they are. */
function partyDetail(customer: QuoteCustomer, sendToName: string | null): string | null {
	const contact = sendToName ?? customer.contactPerson;
	if (contact) return contact;

	const place = [customer.addressLine1, customer.city].filter(Boolean).join(', ');
	return place || null;
}

/**
 * Assemble the issuer's address the way it prints.
 *
 * Empty parts are dropped rather than printed as blank lines, because a business that has not
 * filled in a postal code should get a shorter masthead, not a gap in the middle of one.
 */
export function issuerFrom(business: {
	tradingName: string;
	addressLine1: string | null;
	addressLine2: string | null;
	city: string | null;
	postalCode: string | null;
	vatNumber: string | null;
	phone: string | null;
}): DocumentIssuer {
	const street = [business.addressLine1, business.addressLine2].filter(Boolean).join(', ');
	const town = [business.city, business.postalCode].filter(Boolean).join(' ');

	return {
		tradingName: business.tradingName,
		addressLines: [street, town].filter((line): line is string => Boolean(line)),
		vatNumber: business.vatNumber,
		phone: business.phone
	};
}

/**
 * The line as it prints.
 *
 * `documentDescription` wins when there is one — the design's document says more than the
 * editor's table does, and a line that has not been given a fuller description prints the one
 * the business typed rather than nothing.
 */
function documentLines(quote: Quote, price: QuotePrice): readonly DocumentLine[] {
	return quote.lines.map((line, i) => ({
		id: line.id,
		description: line.documentDescription ?? line.description,
		qty: line.qty,
		amount: price.priced.lines[i].amount
	}));
}

export type QuoteDocumentInput = {
	readonly quote: Quote;
	readonly price: QuotePrice;
	readonly issuer: DocumentIssuer;
	/** The business's own footer, when it has written one. */
	readonly footer?: readonly string[];
	/**
	 * What to print in the number slot for a draft that has not been allocated one.
	 *
	 * `peekDocumentNumber` supplies it, and the editor labels it as provisional. Printing
	 * nothing at all would leave a client-facing preview with a hole in the masthead.
	 */
	readonly provisionalNumber?: string | null;
};

export function quoteDocument({
	quote,
	price,
	issuer,
	footer,
	provisionalNumber = null
}: QuoteDocumentInput): PrintableDocument {
	return {
		kind: 'quote',
		typeLabel: 'QUOTE',
		number: quote.number ?? provisionalNumber,
		issuer,
		party: {
			label: 'Prepared for',
			// A draft with no client chosen yet still has to render. The design never shows
			// this state, and an empty masthead beside a filled-in one reads as broken, so the
			// preview says what is actually true.
			name: quote.customer.name ?? 'No client chosen yet',
			detail: partyDetail(quote.customer, quote.sendTo.name)
		},
		date: quote.validUntil
			? { label: 'Valid until', value: formatDocumentDate(quote.validUntil) }
			: null,
		lines: documentLines(quote, price),
		totals: {
			subtotalLabel: 'Before VAT',
			subtotal: price.subtotal,
			taxLabel: documentTaxLabel(price.priced),
			tax: price.tax,
			totalLabel: 'Total',
			total: price.total
		},
		footer: footer && footer.length > 0 ? footer : DEFAULT_QUOTE_FOOTER,
		pageLabel: 'Page 1 of 1'
	};
}
