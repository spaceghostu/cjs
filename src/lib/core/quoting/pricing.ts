/**
 * WHAT A QUOTE COSTS.
 *
 * There is no arithmetic in this file. Every number below comes out of `priceDocument`, which
 * is the one place a document's totals are calculated — quotes, invoices, credit notes and
 * everything after them. This is the ADAPTER: it turns a `Quote` into the shape the engine
 * takes, and turns what comes back into the three figures the design's screens name.
 *
 * The design's worked example, end to end:
 *
 *   Solid oak kitchen island top   1 × 24 800,00   24 800,00
 *   Base cabinetry, oak veneer     1 ×  8 600,00    8 600,00
 *   Installation and finishing     1 ×  9 000,00    9 000,00
 *                                    Before VAT    42 400,00
 *                                    VAT at 15%     6 360,00
 *                                    Client pays   48 760,00
 *                                    50% deposit   24 380,00
 *
 * `quoting/pricing.test.ts` asserts exactly that, to the cent.
 */
import {
	applyRate,
	priceDocument,
	type LineInput,
	type Money,
	type PricedDocument
} from '$lib/core/money';
import type { DepositTerms, Quote, QuoteLine } from './types';

/** Everything a screen or a document needs about a quote's money, computed together. */
export type QuotePrice = {
	readonly priced: PricedDocument;
	/** "Before VAT". */
	readonly subtotal: Money;
	/** "VAT at 15%". Zero when the engine is `none`. */
	readonly tax: Money;
	/** "Client pays". */
	readonly total: Money;
	/**
	 * What is due on acceptance, or null when this business asks for no deposit.
	 *
	 * Null rather than zero, deliberately: a document with no deposit terms prints no deposit
	 * line, and "R0,00 on acceptance" would be a sentence nobody meant to write.
	 */
	readonly deposit: Money | null;
};

/** The engine's input for one line. Its own snapshotted VAT rate, never a global one. */
function toLineInput(line: QuoteLine): LineInput {
	return {
		unitPrice: line.unitPrice,
		qty: line.qty,
		taxTreatment: line.taxTreatment,
		vatRate: line.vatRate
	};
}

/**
 * The deposit, from the total.
 *
 * A percentage of the TOTAL rather than of the subtotal, because "50% to start" is what the
 * client pays, and what they pay includes the VAT they are being charged. Any other reading
 * makes the two halves of a 50/50 split unequal.
 *
 * `applyRate` is the money engine's rounding, which is the only rounding in this codebase — so
 * a 50% deposit on an odd number of cents lands the way every other divided amount does.
 */
export function depositAmount(terms: DepositTerms, total: Money): Money | null {
	switch (terms.kind) {
		case 'none':
			return null;
		case 'rate':
			return applyRate(total, terms.rate);
		case 'amount':
			return terms.amount;
	}
}

/**
 * Price a quote.
 *
 * Pure, and called from both sides: the editor's preview recomputes it on every keystroke, and
 * the send transaction calls it once to write the snapshot. One function, so the number the
 * business saw and the number the client receives cannot differ.
 */
export function priceQuote(quote: Quote): QuotePrice {
	const priced = priceDocument(quote.lines.map(toLineInput), {
		engine: quote.pricing.engine,
		mode: quote.pricing.mode
	});

	return {
		priced,
		subtotal: priced.subtotal,
		tax: priced.tax,
		total: priced.total,
		deposit: depositAmount(quote.deposit, priced.total)
	};
}

/**
 * What one line's Amount column says.
 *
 * Read off the priced document by index rather than recomputed, because a document-level
 * discount is spread across the lines by largest remainder and a line priced on its own would
 * not carry its share. Today no quote has one; the day one does, this is already right.
 */
export function lineAmounts(price: QuotePrice): readonly Money[] {
	return price.priced.lines.map((l) => l.amount);
}
