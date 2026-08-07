/**
 * THE DOCUMENT, PROVEN.
 *
 * T17's acceptance criteria, minus the two that are structural rather than testable (one
 * renderer for three destinations is a fact about the import graph; paper staying light in
 * dark theme is a fact about `layout.css` never redeclaring `--paper-*`, which
 * `token-contrast.test.ts` already reads directly).
 *
 * WHAT THE GOLDEN FILES HOLD
 * --------------------------
 * The LAYOUT, as a readable table of placed marks — not the PDF bytes. A binary golden file
 * would change on every pdf-lib patch release and tell you only that some bytes differ; this
 * one names the line that moved. Byte stability is asserted separately, as the property it
 * actually is: render twice, compare.
 *
 * The two documents are the design's own worked examples, and the second one settles README
 * open question 1 in the process — the amount column is the LINE TOTAL, which is the only
 * reading under which INV-1042 reconciles.
 */
import { describe, expect, it } from 'vitest';
import { money, quantity } from '$lib/core/money/ctor';
import { ZAR } from '$lib/core/money';
import type { DocumentIssuer, PrintableDocument } from '$lib/core/document';
import { layoutDocument, type Layout } from './layout';
import { pdfFilename, renderDocumentPdf } from './render';

const THORNHILL: DocumentIssuer = {
	tradingName: 'Thornhill Joinery',
	addressLines: ['14 Sir Lowry Road', 'Cape Town 8001'],
	vatNumber: '4890271563',
	phone: '021 447 2210'
};

/** The design's quote: 24 800 + 8 600 + 9 000 -> 42 400 -> VAT 6 360 -> 48 760. */
const QT_1043: PrintableDocument = {
	kind: 'quote',
	typeLabel: 'QUOTE',
	number: 'QT-1043',
	issuer: THORNHILL,
	party: {
		label: 'Prepared for',
		name: 'Fynbos Interiors',
		detail: 'Renske Malan'
	},
	date: { label: 'Valid until', value: '22 August 2026' },
	lines: [
		{
			id: 'l1',
			description: 'Solid oak kitchen island top, 2400 × 900, 40mm European oak, oiled finish',
			qty: quantity(1_000_000),
			amount: money(2_480_000, ZAR)
		},
		{
			id: 'l2',
			description: 'Base cabinetry, oak veneer',
			qty: quantity(1_000_000),
			amount: money(860_000, ZAR)
		},
		{
			id: 'l3',
			description: 'Installation and finishing',
			qty: quantity(1_000_000),
			amount: money(900_000, ZAR)
		}
	],
	totals: {
		subtotalLabel: 'Before VAT',
		subtotal: money(4_240_000, ZAR),
		taxLabel: 'VAT 15%',
		tax: money(636_000, ZAR),
		totalLabel: 'Total',
		total: money(4_876_000, ZAR)
	},
	footer: ['50% deposit to begin · balance on completion', 'Banking details on acceptance'],
	pageLabel: 'Page 1 of 1'
};

/**
 * The design's invoice: 16 400 + 4 600 + 0 -> 21 000 -> VAT 3 150 -> 24 150.
 *
 * `Shelving unit` is qty 2 at a LINE TOTAL of 4 600,00 — README open question 1. The desktop
 * document is authoritative because it is the only version of these five numbers that adds up;
 * the mobile screen's `R9 200` for the same line does not.
 *
 * `Fitting and finishing` at 0,00 is the design's `±0.00` — included, no charge. It prints as a
 * zero-amount line rather than being hidden, because a client who was told it was included
 * should be able to see that on the document.
 */
const INV_1042: PrintableDocument = {
	kind: 'invoice',
	typeLabel: 'TAX INVOICE',
	number: 'INV-1042',
	issuer: THORNHILL,
	party: {
		label: 'Billed to',
		name: 'Meridian Developments',
		detail: '9 Buitengracht Street, Cape Town'
	},
	date: { label: 'Due', value: '18 August 2026' },
	lines: [
		{
			id: 'l1',
			description: 'Counter and bar top',
			qty: quantity(1_000_000),
			amount: money(1_640_000, ZAR)
		},
		{
			id: 'l2',
			description: 'Shelving unit',
			qty: quantity(2_000_000),
			amount: money(460_000, ZAR)
		},
		{
			id: 'l3',
			description: 'Fitting and finishing',
			qty: quantity(1_000_000),
			amount: money(0, ZAR)
		}
	],
	totals: {
		subtotalLabel: 'Before VAT',
		subtotal: money(2_100_000, ZAR),
		taxLabel: 'VAT 15%',
		tax: money(315_000, ZAR),
		totalLabel: 'Amount due',
		total: money(2_415_000, ZAR)
	},
	footer: [
		'Standard Bank · Acc 0271 553 810 · Branch 020909',
		'Thank you — it was a pleasure working with you.'
	],
	pageLabel: 'Page 1 of 1'
};

/**
 * The layout as a fixed-width table. Readable in a diff, which is the whole point.
 *
 * `toFixed` is banned as a money formatter and these are POINTS ON A PAGE — a coordinate has
 * no currency, no rounding policy and no cents. Disabled for the function, with the reason.
 */
/* eslint-disable no-restricted-syntax -- coordinates, not money */
function asTable(layout: Layout): string {
	const rows = layout.texts.map(
		(t) =>
			`${t.y.toFixed(2).padStart(8)}  ${t.x.toFixed(2).padStart(7)}  ${t.align.padEnd(5)}  ` +
			`${t.font.padEnd(8)}  ${String(t.size).padStart(4)}  ${t.ink.padEnd(8)}  ${t.text}`
	);
	const rules = layout.rules.map(
		(r) =>
			`${r.y.toFixed(2).padStart(8)}  ${r.x.toFixed(2).padStart(7)}  rule   ${r.color} × ${r.width.toFixed(2)}`
	);

	return [
		'       Y        X  ALIGN  FONT      SIZE  INK       TEXT',
		...rows,
		'',
		'RULES',
		...rules,
		''
	].join('\n');
}

/* eslint-enable no-restricted-syntax */

describe('layout', () => {
	it('places QT-1043 exactly where it belongs', async () => {
		await expect(asTable(layoutDocument(QT_1043))).toMatchFileSnapshot('./__golden__/QT-1043.txt');
	});

	it('places INV-1042 exactly where it belongs', async () => {
		await expect(asTable(layoutDocument(INV_1042))).toMatchFileSnapshot(
			'./__golden__/INV-1042.txt'
		);
	});

	it('sets the statutory wording on an invoice and not on a quote', () => {
		const invoice = layoutDocument(INV_1042).texts.map((t) => t.text);
		const quote = layoutDocument(QT_1043).texts.map((t) => t.text);

		// A South African tax invoice has statutory content requirements under s20 of the VAT
		// Act, and the wording is one of them.
		expect(invoice).toContain('TAX INVOICE');
		expect(quote).toContain('QUOTE');
		expect(quote).not.toContain('TAX INVOICE');

		// The issuer's VAT number is another of them.
		expect(invoice.some((t) => t.includes('VAT 4890271563'))).toBe(true);
	});

	it('prints every amount to two decimals, in mono', () => {
		const layout = layoutDocument(INV_1042);
		const amounts = layout.texts.filter((t) => t.font === 'mono' && t.text.includes(','));

		expect(amounts.length).toBeGreaterThan(0);
		for (const a of amounts) expect(a.text).toMatch(/,\d{2}$/);

		// Including the zero-charge line — `±0.00` in the design. Hiding it would hide a
		// promise the client was made.
		expect(amounts.map((a) => a.text)).toContain('0,00');
	});

	it('right-aligns the numeric columns on a common edge', () => {
		const layout = layoutDocument(INV_1042);
		const amounts = layout.texts.filter((t) => t.font === 'mono' && t.align === 'right');
		const edges = new Set(amounts.map((t) => t.x));

		// Line amounts, the totals stack and the document number all hang off the right margin;
		// quantities off the quantity column. Two edges, not seven.
		expect(edges.size).toBeLessThanOrEqual(2);
	});
});

describe('the PDF', () => {
	it('is a PDF, with its fonts inside it', async () => {
		const bytes = await renderDocumentPdf(QT_1043);
		const head = new TextDecoder().decode(bytes.slice(0, 8));
		const whole = new TextDecoder('latin1').decode(bytes);

		expect(head).toMatch(/^%PDF-1\./);
		// `FontFile2` is an embedded TrueType program. Three of them: Inter 400, Inter 600 and
		// JetBrains Mono. Without these the document renders in whatever the reader has, which
		// is a different document.
		expect(whole.split('FontFile2').length - 1).toBe(3);
		expect(whole).toContain('/Producer');
	});

	it('regenerates byte for byte', async () => {
		// The audit-trail criterion. Timestamps, object streams and the producer string are the
		// three things that would break this, and all three are pinned in `render.ts`.
		const first = await renderDocumentPdf(QT_1043);
		const second = await renderDocumentPdf(QT_1043);

		expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
	});

	it('differs when the document differs', async () => {
		// The other half of the same claim: stable is not the same as constant.
		const quote = await renderDocumentPdf(QT_1043);
		const invoice = await renderDocumentPdf(INV_1042);

		expect(Buffer.compare(Buffer.from(quote), Buffer.from(invoice))).not.toBe(0);
	});

	it('names the file after the number a client would phone about', () => {
		expect(pdfFilename(QT_1043)).toBe('QT-1043.pdf');
		expect(pdfFilename({ ...QT_1043, number: null })).toBe('quote-draft.pdf');
		expect(pdfFilename({ ...INV_1042, number: null })).toBe('invoice-draft.pdf');
	});
});
