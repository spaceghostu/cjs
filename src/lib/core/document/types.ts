/**
 * THE PRINTABLE DOCUMENT — one shape, three destinations.
 *
 * T17's requirement, stated plainly: "One renderer serves three places: the live preview in
 * the quote editor, the document panel in the invoice detail, and the PDF the client receives.
 * They must be the same code, or they will drift, and the client will receive something the
 * business never saw."
 *
 * A shared renderer needs a shared input, and this is it. It is deliberately NOT a quote and
 * not an invoice: it is the paper. Quoting projects into it (`$lib/core/quoting/document.ts`),
 * Invoicing will project into it at T19, and neither renderer ever branches on which module it
 * came from — the differences the design actually states are DATA here (`QUOTE` versus `TAX
 * INVOICE`, "Prepared for" versus "Billed to", "Valid until" versus "Due").
 *
 * `TAX INVOICE` in particular is not a label choice. A South African tax invoice has statutory
 * content requirements under s20 of the VAT Act and the wording is one of them, which is why
 * the type label is a closed union rather than a free string.
 *
 * CLIENT-SAFE, and it has to be: the editor's live preview renders in the browser.
 */
import type { Money, Quantity } from '$lib/core/money';

export const DOCUMENT_KINDS = ['quote', 'invoice'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * The words at the top right of the sheet.
 *
 * A closed union so that "TAX INVOICE" cannot be spelled two ways or accidentally applied to a
 * document from a business that is not a VAT vendor — `s58(1)(a)` makes representing tax where
 * none is payable a criminal offence, and `priceDocument` already refuses to compute one. This
 * keeps the heading honest for the same reason.
 */
export type DocumentTypeLabel = 'QUOTE' | 'TAX INVOICE' | 'INVOICE';

/** The business, as its own masthead. Everything here comes from `core_business`. */
export type DocumentIssuer = {
	readonly tradingName: string;
	/** Street address, already assembled into the lines it prints as. */
	readonly addressLines: readonly string[];
	readonly vatNumber: string | null;
	readonly phone: string | null;
};

/** Who it is for. "Prepared for" on a quote, "Billed to" on an invoice. */
export type DocumentParty = {
	readonly label: string;
	readonly name: string;
	/** The contact or the address, at 11px beneath the name. */
	readonly detail: string | null;
};

/** The dated promise in the top right of the parties block. */
export type DocumentDate = {
	/** "Valid until" or "Due". */
	readonly label: string;
	/** Already formatted — `formatDocumentDate`, which does not depend on host ICU data. */
	readonly value: string;
};

/**
 * One printed line.
 *
 * The description here is the DOCUMENT's, which the design makes fuller than the editor's: the
 * editor shows "Solid oak kitchen island top, 2400 × 900" and the document shows "…, 40mm
 * European oak, oiled finish". The fallback lives in the projection, not here, so a renderer
 * never has to know that two descriptions existed.
 */
export type DocumentLine = {
	readonly id: string;
	readonly description: string;
	readonly qty: Quantity;
	readonly amount: Money;
};

/** The right-aligned stack. Labels are data because a quote and an invoice word it differently. */
export type DocumentTotals = {
	readonly subtotalLabel: string;
	readonly subtotal: Money;
	/** "VAT 15%" — produced by the money engine, never written here. */
	readonly taxLabel: string;
	readonly tax: Money;
	/** "Total" on a quote, "Amount due" on an invoice. */
	readonly totalLabel: string;
	readonly total: Money;
};

/**
 * The paper.
 *
 * `number` is nullable because a draft quote has none — the editor's preview shows the
 * provisional one, and the renderer prints what it is given.
 */
export type PrintableDocument = {
	readonly kind: DocumentKind;
	readonly typeLabel: DocumentTypeLabel;
	/** `QT-1043`. */
	readonly number: string | null;
	readonly issuer: DocumentIssuer;
	readonly party: DocumentParty;
	readonly date: DocumentDate | null;
	readonly lines: readonly DocumentLine[];
	readonly totals: DocumentTotals;
	/**
	 * The footer, one array element per printed line. Quotes carry "50% deposit to begin ·
	 * balance on completion" and "Banking details on acceptance"; invoices carry banking
	 * details and a thank you.
	 */
	readonly footer: readonly string[];
	/** "Page 1 of 1". Data, because it stops being a constant the moment a document is long. */
	readonly pageLabel: string;
};
