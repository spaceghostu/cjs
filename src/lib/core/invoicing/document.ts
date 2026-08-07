/**
 * AN INVOICE, AS PAPER.
 *
 * The projection from Invoicing's model into the shared `PrintableDocument` that T17's renderer
 * takes. Everything the sheet differs on between a quote and an invoice is decided here and
 * carried as DATA, so `$lib/components/document` and the PDF layout never branch on which module
 * produced the page. `quoting/document.ts` is the same file for the other module, and the two
 * renderers they feed are one renderer.
 *
 * `TAX INVOICE` IS NOT A LABEL CHOICE
 * -----------------------------------
 * A South African tax invoice has statutory content requirements under s20 of the VAT Act, and
 * the wording is one of them — as is the supplier's VAT number. A business that is NOT a VAT
 * vendor must not issue a document headed `TAX INVOICE`: s58(1)(a) makes representing tax where
 * none is payable a criminal offence. `priceDocument` already refuses to compute VAT under the
 * `none` engine; this keeps the HEADING honest for the same reason, and it is derived from the
 * issuer rather than chosen by a caller so there is no way to get it wrong from a template.
 */
import { formatRatePercent, type PricedDocument } from '$lib/core/money';
import { formatDocumentDate } from '$lib/core/calendar';
import type {
	DocumentIssuer,
	DocumentLine,
	DocumentTypeLabel,
	PrintableDocument
} from '$lib/core/document';
import type { Invoice, InvoiceCustomer } from './types';
import type { InvoicePrice } from './pricing';

/**
 * The footer an invoice carries when the business has not written its own.
 *
 * T21's document footer is "Thank you — we appreciate your business.", and the banking details
 * sit above it. The details themselves come from the business's invoicing settings, because an
 * invoice with no bank account on it is an invoice nobody can pay — but a business that has not
 * filled them in still has to be able to issue one, so their absence shortens the footer rather
 * than blocking the document.
 */
export const DEFAULT_INVOICE_FOOTER: readonly string[] = Object.freeze([
	'Thank you — we appreciate your business.'
]);

/**
 * "VAT 15%" — the wording the DOCUMENT uses, identical to a quote's.
 *
 * Derived from the same `ratePpm` through the same formatter as every other rendering of the
 * rate, so the percentage cannot disagree between the editor, the sheet and the PDF. A document
 * with several rates, or none, falls back to the bare word.
 */
export function documentTaxLabel(priced: PricedDocument): string {
	const taxed = priced.groups.filter((g) => g.ratePpm !== 0);
	if (taxed.length !== 1) return 'VAT';
	return `VAT ${formatRatePercent(taxed[0].ratePpm)}%`;
}

/**
 * `TAX INVOICE` or `INVOICE` — decided by the issuer's VAT registration.
 *
 * See the note at the top of this file. Registration is compulsory only above the R1m turnover
 * threshold, so a great many small businesses have no VAT number and must still be able to
 * invoice — they simply issue a document that is not a tax invoice.
 */
export function invoiceTypeLabel(issuer: DocumentIssuer): DocumentTypeLabel {
	return issuer.vatNumber ? 'TAX INVOICE' : 'INVOICE';
}

/** The line beneath the client's name: the person it is addressed to, or where they are. */
function partyDetail(customer: InvoiceCustomer, sendToName: string | null): string | null {
	const contact = sendToName ?? customer.contactPerson;
	if (contact) return contact;

	const place = [customer.addressLine1, customer.city].filter(Boolean).join(', ');
	return place || null;
}

/**
 * The line as it prints.
 *
 * `documentDescription` wins when there is one. The amount is read off the PRICED document by
 * index — it is the line total, which is the whole of README open question 1.
 *
 * A no-charge line prints its zero rather than being hidden. The design shows `±0.00` against
 * "Fitting and finishing", and a client who was told something was included should be able to
 * see that on the paper they were sent; dropping the row would hide a promise they were made.
 */
function documentLines(invoice: Invoice, price: InvoicePrice): readonly DocumentLine[] {
	return invoice.lines.map((line, i) => ({
		id: line.id,
		description: line.documentDescription ?? line.description,
		qty: line.qty,
		amount: price.priced.lines[i].amount
	}));
}

export type InvoiceDocumentInput = {
	readonly invoice: Invoice;
	readonly price: InvoicePrice;
	readonly issuer: DocumentIssuer;
	/** Banking details, as the business wrote them. One printed line each. */
	readonly bankingDetails?: readonly string[] | null;
	/** The business's own closing words, when it has written some. */
	readonly footer?: readonly string[] | null;
	/**
	 * What to print in the number slot for a draft that has not been allocated one.
	 *
	 * `peekDocumentNumber` supplies it and the editor labels it as provisional. Printing nothing
	 * would leave a client-facing preview with a hole in the masthead.
	 */
	readonly provisionalNumber?: string | null;
};

export function invoiceDocument({
	invoice,
	price,
	issuer,
	bankingDetails,
	footer,
	provisionalNumber = null
}: InvoiceDocumentInput): PrintableDocument {
	return {
		kind: 'invoice',
		typeLabel: invoiceTypeLabel(issuer),
		number: invoice.number ?? provisionalNumber,
		issuer,
		party: {
			label: 'Billed to',
			// A draft with no client chosen yet still has to render. The design never draws this
			// state, and an empty masthead beside a filled-in one reads as broken, so the preview
			// says what is actually true.
			name: invoice.customer.name ?? 'No client chosen yet',
			detail: partyDetail(invoice.customer, invoice.sendTo.name)
		},
		date: invoice.dueDate ? { label: 'Due', value: formatDocumentDate(invoice.dueDate) } : null,
		lines: documentLines(invoice, price),
		totals: {
			subtotalLabel: 'Before VAT',
			subtotal: price.subtotal,
			taxLabel: documentTaxLabel(price.priced),
			tax: price.tax,
			// Not "Total". The client's question is what to pay, and the design answers it in the
			// words they would use.
			totalLabel: 'Amount due',
			total: price.total
		},
		footer: [...(bankingDetails ?? []), ...(footer?.length ? footer : DEFAULT_INVOICE_FOOTER)],
		pageLabel: 'Page 1 of 1'
	};
}
