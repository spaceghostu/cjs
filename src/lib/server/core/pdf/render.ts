/**
 * THE PDF.
 *
 * `layout.ts` decided where every mark goes; this draws them, and does nothing else. The
 * split is what makes the layout a pure unit under golden-file test and keeps pdf-lib —
 * the only part that is a library rather than a decision — behind one small file.
 *
 * WHY pdf-lib AND NOT A HEADLESS BROWSER
 * --------------------------------------
 * T17 asks for no headless browser at runtime if it can be avoided, and it can. Chromium in a
 * container is 300MB of attack surface, a second failure mode on every send, and — the part
 * that actually disqualifies it — non-deterministic output: two renders of the same HTML
 * differ in font hinting, in metadata and in compression. pdf-lib draws exactly what it is
 * told, in pure JavaScript, with embedded fonts.
 *
 * BYTE STABILITY, AND THE THREE THINGS THAT THREATEN IT
 * -----------------------------------------------------
 * "Regenerating an unchanged document produces an identical PDF" is an acceptance criterion,
 * and without care a PDF is one of the least reproducible artefacts there is:
 *
 *   1. TIMESTAMPS. A PDF carries CreationDate and ModDate. Left alone, pdf-lib writes `now`,
 *      and every regeneration differs. Both are pinned to the Unix epoch — the document's real
 *      dates are ON the document, where a client can read them, rather than in metadata only a
 *      tool can see.
 *   2. OBJECT STREAMS. Compressed object streams pack objects in an order that depends on
 *      internal iteration. `useObjectStreams: false` costs a few kilobytes and removes the
 *      variable.
 *   3. THE PRODUCER STRING. pdf-lib writes its own version into the file; pinned here so an
 *      upgrade is a deliberate, visible change rather than a silent diff in every document.
 *
 * `pdf.test.ts` renders the same document twice and compares the bytes, so a regression in any
 * of the three is caught rather than discovered by an auditor.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PrintableDocument } from '$lib/core/document';
import { loadFonts } from './fonts';
import { PAGE, PAPER, layoutDocument, type FontRole, type PlacedText } from './layout';

/**
 * The epoch, for both document dates.
 *
 * Not "the date the quote was sent": that IS a difference between two documents, and it is
 * already printed on the paper. Metadata that changes on every regeneration turns the audit
 * trail into noise, which is the thing T17 says it must not be.
 */
const FIXED_DATE = new Date(0);

const PRODUCER = 'CJs Platform';

/** Advance widths, so a tracked string measures correctly for right-alignment. */
function widthOf(font: PDFFont, text: string, size: number, tracking: number): number {
	const base = font.widthOfTextAtSize(text, size);
	// The trailing character carries no space after it, which is why this is length - 1.
	return base + (text.length > 0 ? (text.length - 1) * tracking : 0);
}

/**
 * Draw one run.
 *
 * `y` arrives measured DOWN from the top of the page, because that is how a document is read
 * and how the layout is written. PDF measures UP from the bottom, so the flip happens here,
 * once, rather than in three hundred layout expressions.
 */
function drawText(page: PDFPage, fonts: Record<FontRole, PDFFont>, t: PlacedText): void {
	const font = fonts[t.font];
	const tracking = t.tracking ?? 0;
	const colour = t.ink === 'ink' ? PAPER.ink : PAPER.inkMuted;

	const x = t.align === 'right' ? t.x - widthOf(font, t.text, t.size, tracking) : t.x;
	// The baseline sits below the given top edge by roughly the cap height.
	const baseline = PAGE.height - t.y - t.size * 0.82;

	page.drawText(t.text, {
		x,
		y: baseline,
		size: t.size,
		font,
		color: rgb(colour[0], colour[1], colour[2]),
		...(tracking ? { characterSpacing: tracking } : {})
	});
}

/**
 * A `PrintableDocument`, as bytes.
 *
 * The same model the editor previews and the invoice detail panel renders. Nothing about the
 * quote or the invoice reaches this function — by the time a document is here it is paper, and
 * paper does not know which module made it.
 */
export async function renderDocumentPdf(document: PrintableDocument): Promise<Uint8Array> {
	const bytes = await loadFonts();

	const pdf = await PDFDocument.create();
	pdf.registerFontkit(fontkit);

	const fonts: Record<FontRole, PDFFont> = {
		regular: await pdf.embedFont(bytes.regular, { subset: true }),
		semibold: await pdf.embedFont(bytes.semibold, { subset: true }),
		mono: await pdf.embedFont(bytes.mono, { subset: true })
	};

	pdf.setTitle(`${document.typeLabel} ${document.number ?? ''}`.trim());
	pdf.setAuthor(document.issuer.tradingName);
	pdf.setProducer(PRODUCER);
	pdf.setCreator(PRODUCER);
	pdf.setCreationDate(FIXED_DATE);
	pdf.setModificationDate(FIXED_DATE);

	const page = pdf.addPage([PAGE.width, PAGE.height]);

	// The sheet itself. `#FBFBF9` rather than white, everywhere the paper appears — including
	// here, so a printed document matches the one on screen.
	page.drawRectangle({
		x: 0,
		y: 0,
		width: PAGE.width,
		height: PAGE.height,
		color: rgb(PAPER.bg[0], PAPER.bg[1], PAPER.bg[2])
	});

	const { texts, rules } = layoutDocument(document);

	for (const rule of rules) {
		const colour = rule.color === 'rule' ? PAPER.rule : PAPER.ruleLight;
		page.drawRectangle({
			x: rule.x,
			y: PAGE.height - rule.y,
			width: rule.width,
			height: 0.75,
			color: rgb(colour[0], colour[1], colour[2])
		});
	}

	for (const text of texts) drawText(page, fonts, text);

	return pdf.save({ useObjectStreams: false });
}

/**
 * What the file is called when it lands in somebody's Downloads folder.
 *
 * The document number, because that is what a client will phone about. A draft has none, so it
 * gets a name that says what it is rather than a UUID.
 */
export function pdfFilename(document: PrintableDocument): string {
	const stem = document.number ?? (document.kind === 'quote' ? 'quote-draft' : 'invoice-draft');
	return `${stem.replaceAll(/[^A-Za-z0-9-]/g, '-')}.pdf`;
}
