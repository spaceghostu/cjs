/**
 * WHAT AN INVOICE COMES TO.
 *
 * There is no arithmetic in this file. Every number below comes out of `priceDocument`, the one
 * place a document's totals are calculated — quotes, invoices, credit notes and everything
 * after them. This is the ADAPTER, and it is deliberately the same shape as
 * `quoting/pricing.ts`: the two modules must not be able to disagree about what 15% of R21 000
 * is, and the only way to guarantee that is for neither of them to work it out.
 *
 * The design's worked example, end to end — README open question 1, settled:
 *
 *   Counter and bar top       1 × 16 400,00   16 400,00
 *   Shelving unit             2 ×  2 300,00    4 600,00
 *   Fitting and finishing     1 ×      0,00        0,00   (included, no charge)
 *                                Before VAT    21 000,00
 *                                    VAT 15%     3 150,00
 *                                 Amount due    24 150,00
 *
 * The AMOUNT COLUMN IS THE LINE TOTAL. It is the only reading under which those five numbers
 * add up, the golden PDF in `pdf/__golden__/INV-1042.txt` already places them that way, and the
 * mobile screen's `R9 200` for the shelving line is the error. T22 renders R4 600.
 */
import { priceDocument, type LineInput, type Money, type PricedDocument } from '$lib/core/money';
import type { Invoice, InvoiceLine } from './types';

/** Everything a screen or a document needs about an invoice's money, computed together. */
export type InvoicePrice = {
	readonly priced: PricedDocument;
	/** "Before VAT". */
	readonly subtotal: Money;
	/** "VAT 15%". Zero when the engine is `none`. */
	readonly tax: Money;
	/** "Amount due" — before anything has been paid against it. */
	readonly total: Money;
};

/** The engine's input for one line. Its own snapshotted VAT rate, never a global one. */
function toLineInput(line: InvoiceLine): LineInput {
	return {
		unitPrice: line.unitPrice,
		qty: line.qty,
		taxTreatment: line.taxTreatment,
		vatRate: line.vatRate
	};
}

/**
 * Price an invoice.
 *
 * Pure, and called from both sides: the editor's preview recomputes it as somebody types, and
 * the issue transaction calls it once to write the snapshot. One function, so the number the
 * business saw and the number on the client's copy cannot differ.
 */
export function priceInvoice(invoice: Invoice): InvoicePrice {
	const priced = priceDocument(invoice.lines.map(toLineInput), {
		engine: invoice.pricing.engine,
		mode: invoice.pricing.mode
	});

	return { priced, subtotal: priced.subtotal, tax: priced.tax, total: priced.total };
}

/**
 * What one line's Amount column says.
 *
 * Read off the priced document by index rather than recomputed, because a document-level
 * discount is spread across the lines by largest remainder and a line priced on its own would
 * not carry its share. Today no invoice has one; the day one does, this is already right.
 */
export function lineAmounts(price: InvoicePrice): readonly Money[] {
	return price.priced.lines.map((l) => l.amount);
}
