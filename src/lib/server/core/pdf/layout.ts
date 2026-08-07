/**
 * WHERE EVERYTHING GOES ON THE PAGE.
 *
 * Pure. No pdf-lib, no fonts, no filesystem — this turns a `PrintableDocument` into a list of
 * placed marks, and `render.ts` draws them. Two reasons that separation is worth having:
 *
 *  1. IT IS TESTABLE. The golden-file tests in `pdf.test.ts` assert this output, which is a
 *     readable text table rather than 4KB of binary. A layout regression names the line that
 *     moved instead of reporting that some bytes differ.
 *
 *  2. IT IS DETERMINISTIC BY CONSTRUCTION. Nothing here reads a clock, a locale or a font
 *     file, so the same document produces the same marks forever. T17 requires a regenerated
 *     PDF of an unchanged document to be identical, and the only honest way to get there is
 *     for every input to be an input.
 *
 * THE MEASUREMENTS ARE THE COMPONENT'S.
 *
 * `$lib/components/document/DocumentSheet.svelte` sets the sheet in absolute pixels because
 * the design measures it as paper; the numbers below are the same ones in points. One point
 * is treated as one CSS pixel here — the sheet's ~500px content width and A4's 499pt between
 * these margins are within a point of each other, so the two renderings are the same document
 * rather than two interpretations of one.
 */
import { formatZar, type Money } from '$lib/core/money';
import { qtyText } from '$lib/components/money/amount';
import type { PrintableDocument } from '$lib/core/document';

/** A4. The paper every South African business prints on. */
export const PAGE = Object.freeze({ width: 595.28, height: 841.89 });

export const MARGIN = Object.freeze({ left: 48, right: 48, top: 52, bottom: 48 });

export const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

/** The design's five paper values, as RGB triples in the 0–1 range pdf-lib takes. */
export const PAPER = Object.freeze({
	bg: rgb('#FBFBF9'),
	ink: rgb('#1A1A1A'),
	inkMuted: rgb('#6E6E6A'),
	rule: rgb('#E4E2DC'),
	ruleLight: rgb('#EFEDE7')
});

function rgb(hex: string): readonly [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	// Bit shifts, not division of a float — this is colour, not money, and the result is an
	// exact byte either way.
	return Object.freeze([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
}

export type FontRole = 'regular' | 'semibold' | 'mono';
export type Align = 'left' | 'right';
export type Ink = 'ink' | 'inkMuted';

/** One run of text, placed. `y` is measured DOWN from the top of the page. */
export type PlacedText = {
	readonly text: string;
	readonly x: number;
	readonly y: number;
	readonly size: number;
	readonly font: FontRole;
	readonly ink: Ink;
	readonly align: Align;
	/** Letter-spacing, in points. The masthead's `0.14em` at 14pt is 1.96. */
	readonly tracking?: number;
};

/** A horizontal rule. */
export type PlacedRule = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly color: 'rule' | 'ruleLight';
};

export type Layout = {
	readonly texts: readonly PlacedText[];
	readonly rules: readonly PlacedRule[];
	/** How far down the content reached. Used by the tests, and by pagination when it lands. */
	readonly height: number;
};

/**
 * Amounts on a document carry no currency symbol and always two decimals.
 *
 * The masthead establishes the currency; repeating `R` in ninety table cells is noise, and the
 * design's own documents print `16 400.00`. Two decimals is not a preference — a tax invoice
 * that drops the cents is a defective one.
 */
function amount(value: Money): string {
	return formatZar(value, { decimals: 2, symbol: false });
}

const RIGHT = MARGIN.left + CONTENT_WIDTH;

/** Column geometry, matching `DocumentSheet`'s `1fr 40px 88px` / `1fr 40px 92px`. */
function columns(kind: PrintableDocument['kind']) {
	const amountWidth = kind === 'invoice' ? 92 : 88;
	const qtyWidth = 40;
	const gap = 12;
	return {
		descriptionX: MARGIN.left,
		descriptionWidth: CONTENT_WIDTH - amountWidth - qtyWidth - gap * 2,
		qtyRight: RIGHT - amountWidth - gap,
		amountRight: RIGHT
	};
}

/**
 * Break a description onto as many lines as it needs.
 *
 * Measured in characters rather than in glyph widths, because this file has no font. The
 * estimate is deliberately conservative — Inter at 12pt averages a little under 6pt per
 * character, so 5.6 leaves room and a description wraps a word early rather than running into
 * the Qty column. Getting this exactly right would mean moving layout behind the font loader
 * and giving up a pure, golden-testable unit for a gain nobody can see.
 */
function wrap(text: string, width: number, size: number): string[] {
	const perChar = size * 0.47;
	// Characters per line, not money: there is no rounding policy to respect, because half a
	// character cannot be typeset.
	// eslint-disable-next-line no-restricted-syntax -- not money, see above
	const max = Math.max(8, Math.trunc(width / perChar));
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= max) {
			current = candidate;
			continue;
		}
		if (current) lines.push(current);
		current = word;
	}
	if (current) lines.push(current);
	return lines.length ? lines : [''];
}

export function layoutDocument(document: PrintableDocument): Layout {
	const texts: PlacedText[] = [];
	const rules: PlacedRule[] = [];
	let y = MARGIN.top;

	const put = (t: PlacedText) => texts.push(t);

	// ── Masthead ──────────────────────────────────────────────────────────────────
	put({
		text: document.issuer.tradingName.toUpperCase(),
		x: MARGIN.left,
		y,
		size: 14,
		font: 'semibold',
		ink: 'ink',
		align: 'left',
		tracking: 14 * 0.14
	});

	put({
		text: document.typeLabel,
		x: RIGHT,
		y,
		size: 11,
		font: 'regular',
		ink: 'inkMuted',
		align: 'right',
		tracking: 11 * 0.1
	});

	if (document.number) {
		put({
			text: document.number,
			x: RIGHT,
			y: y + 16,
			size: 13,
			font: 'mono',
			ink: 'ink',
			align: 'right'
		});
	}

	// 11px at 1.6 line-height, per T17.
	let issuerY = y + 20;
	const issuerLines = [...document.issuer.addressLines];
	const identity = [
		document.issuer.vatNumber ? `VAT ${document.issuer.vatNumber}` : null,
		document.issuer.phone
	].filter(Boolean);
	if (identity.length) issuerLines.push(identity.join(' · '));

	for (const line of issuerLines) {
		put({
			text: line,
			x: MARGIN.left,
			y: issuerY,
			size: 11,
			font: 'regular',
			ink: 'inkMuted',
			align: 'left'
		});
		issuerY += 11 * 1.6;
	}

	y = Math.max(issuerY, y + 34) + 14;

	// ── Parties ───────────────────────────────────────────────────────────────────
	rules.push({ x: MARGIN.left, y, width: CONTENT_WIDTH, color: 'rule' });
	y += 16;

	put({
		text: document.party.label.toUpperCase(),
		x: MARGIN.left,
		y,
		size: 10,
		font: 'regular',
		ink: 'inkMuted',
		align: 'left',
		tracking: 10 * 0.08
	});
	put({
		text: document.party.name,
		x: MARGIN.left,
		y: y + 14,
		size: 13,
		font: 'regular',
		ink: 'ink',
		align: 'left'
	});
	if (document.party.detail) {
		put({
			text: document.party.detail,
			x: MARGIN.left,
			y: y + 28,
			size: 11,
			font: 'regular',
			ink: 'inkMuted',
			align: 'left'
		});
	}

	if (document.date) {
		put({
			text: document.date.label.toUpperCase(),
			x: RIGHT,
			y,
			size: 10,
			font: 'regular',
			ink: 'inkMuted',
			align: 'right',
			tracking: 10 * 0.08
		});
		put({
			text: document.date.value,
			x: RIGHT,
			y: y + 14,
			size: 13,
			font: 'regular',
			ink: 'ink',
			align: 'right'
		});
	}

	y += document.party.detail ? 46 : 36;

	// ── Lines ─────────────────────────────────────────────────────────────────────
	const col = columns(document.kind);
	y += 14;

	put({
		text: 'DESCRIPTION',
		x: col.descriptionX,
		y,
		size: 10,
		font: 'regular',
		ink: 'inkMuted',
		align: 'left',
		tracking: 0.8
	});
	put({
		text: 'QTY',
		x: col.qtyRight,
		y,
		size: 10,
		font: 'regular',
		ink: 'inkMuted',
		align: 'right',
		tracking: 0.8
	});
	put({
		text: 'AMOUNT',
		x: col.amountRight,
		y,
		size: 10,
		font: 'regular',
		ink: 'inkMuted',
		align: 'right',
		tracking: 0.8
	});

	y += 12;
	rules.push({ x: MARGIN.left, y, width: CONTENT_WIDTH, color: 'rule' });

	for (const line of document.lines) {
		y += 13;
		const wrapped = wrap(line.description, col.descriptionWidth, 12);

		wrapped.forEach((text, i) => {
			put({
				text,
				x: col.descriptionX,
				y: y + i * 18,
				size: 12,
				font: 'regular',
				ink: 'ink',
				align: 'left'
			});
		});

		// Quantity and amount sit on the FIRST line of a wrapped description, which is where a
		// reader looks for them.
		put({
			text: qtyText(line.qty),
			x: col.qtyRight,
			y,
			size: 12,
			font: 'mono',
			ink: 'ink',
			align: 'right'
		});
		put({
			text: amount(line.amount),
			x: col.amountRight,
			y,
			size: 12,
			font: 'mono',
			ink: 'ink',
			align: 'right'
		});

		y += (wrapped.length - 1) * 18 + 9;
		rules.push({ x: MARGIN.left, y, width: CONTENT_WIDTH, color: 'ruleLight' });
	}

	// ── Totals ────────────────────────────────────────────────────────────────────
	const totalsLeft = RIGHT - 200;
	y += 18;

	put({
		text: document.totals.subtotalLabel,
		x: totalsLeft,
		y,
		size: 11,
		font: 'regular',
		ink: 'inkMuted',
		align: 'left'
	});
	put({
		text: amount(document.totals.subtotal),
		x: RIGHT,
		y,
		size: 11,
		font: 'mono',
		ink: 'ink',
		align: 'right'
	});

	y += 16;
	put({
		text: document.totals.taxLabel,
		x: totalsLeft,
		y,
		size: 11,
		font: 'regular',
		ink: 'inkMuted',
		align: 'left'
	});
	put({
		text: amount(document.totals.tax),
		x: RIGHT,
		y,
		size: 11,
		font: 'mono',
		ink: 'ink',
		align: 'right'
	});

	y += 12;
	rules.push({ x: totalsLeft, y, width: 200, color: 'rule' });
	y += 15;

	put({
		text: document.totals.totalLabel,
		x: totalsLeft,
		y,
		size: 11,
		font: 'regular',
		ink: 'ink',
		align: 'left'
	});
	put({
		text: amount(document.totals.total),
		x: RIGHT,
		y,
		size: 16,
		font: 'mono',
		ink: 'ink',
		align: 'right'
	});

	// ── Footer ────────────────────────────────────────────────────────────────────
	//
	// Pinned to the bottom of the sheet rather than trailing the totals. A document whose terms
	// float halfway up the page reads as unfinished, and the terms are the part a client is
	// most likely to look for twice.
	const footerTop = PAGE.height - MARGIN.bottom - Math.max(document.footer.length, 1) * 17;
	rules.push({ x: MARGIN.left, y: footerTop - 12, width: CONTENT_WIDTH, color: 'rule' });

	document.footer.forEach((term, i) => {
		put({
			text: term,
			x: MARGIN.left,
			y: footerTop + i * 17,
			size: 10,
			font: 'regular',
			ink: 'inkMuted',
			align: 'left'
		});
	});

	put({
		text: document.pageLabel,
		x: RIGHT,
		y: footerTop,
		size: 10,
		font: 'regular',
		ink: 'inkMuted',
		align: 'right'
	});

	return { texts, rules, height: y };
}
