/**
 * The presentation rules for numbers, as pure functions.
 *
 * NO ARITHMETIC LIVES HERE. Everything that computes — rounding, VAT, allocation — is in
 * `$lib/core/money`, and this file only decides how the result is spelled and coloured.
 * Keeping it pure is also what lets every size / tone / signed / decimals combination be
 * unit-tested without a browser.
 */
import { absMoney, formatQty, formatUnitPrice, formatZar, negateQty } from '$lib/core/money';
import type { Money, Quantity, UnitPrice } from '$lib/core/money';

/** U+2212. A hyphen is not a minus sign, and next to tabular figures it reads as a dash. */
export const MINUS = '−';
export const PLUS = '+';

export type AmountSize = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

/**
 * `default` is deliberately colourless. The design is firm that money is neutral and that
 * colour flags an exception — a screen where every figure is coloured tells the owner
 * nothing about which one needs them.
 */
export type AmountTone = 'default' | 'owed' | 'settled' | 'muted';

export type AmountOptions = {
	/** Render an explicit + or −, for a variance rather than a balance. */
	signed?: boolean;
	/** 0 for a screen summary (R84 200), 2 for a document line (24 800,00). */
	decimals?: 2 | 0;
	/** Drop the R. Table columns that carry the symbol in the header do this. */
	symbol?: boolean;
};

const SIZE_CLASS: Record<AmountSize, string> = {
	sm: 'text-[13px]',
	md: 'text-ui',
	lg: 'text-[20px] tracking-[-0.02em]',
	xl: 'text-[24px] tracking-[-0.02em]',
	hero: 'text-[32px] leading-[1.15] tracking-[-0.02em]'
};

const TONE_CLASS: Record<AmountTone, string> = {
	default: 'text-ink',
	/** Receivable totals. The invoicing accent, because owed money belongs to Invoicing. */
	owed: 'text-invoicing',
	settled: 'text-settled',
	muted: 'text-ink-muted'
};

/** Mono and tabular first, so a column of these aligns on the decimal whatever else changes. */
export function amountClass(size: AmountSize = 'md', tone: AmountTone = 'default'): string {
	return `numeric ${SIZE_CLASS[size]} ${TONE_CLASS[tone]}`;
}

/**
 * The text of an amount.
 *
 * The sign is applied HERE rather than left to `formatZar`, for two reasons: the design
 * wants a real minus glyph, and a variance needs a leading + that no formatter should
 * invent on its own.
 */
export function amountText(value: Money, opts: AmountOptions = {}): string {
	const { signed = false, decimals = 2, symbol = true } = opts;
	const body = formatZar(absMoney(value), { decimals, symbol });

	if (value.cents < 0) return MINUS + body;
	// A signed zero is neither up nor down, so it gets no sign.
	if (signed && value.cents > 0) return PLUS + body;
	return body;
}

export function qtyText(value: Quantity): string {
	return formatQty(value);
}

/**
 * A quantity as a VARIANCE: "−4", "+3", "0".
 *
 * `formatQty` emits an ASCII hyphen, which is right for a machine-readable export and wrong
 * beside tabular figures — the same reason `amountText` applies its own sign rather than letting
 * `formatZar` do it. A hyphen next to mono numerals reads as a dash between two things.
 *
 * The leading `+` is the other half, and it is why this is a separate function rather than an
 * option on `qtyText`: a balance of 3 is "3", but a stock count that found three more boards than
 * expected is "+3", and no formatter should decide on its own which of those it is looking at.
 * A zero difference gets no sign, because it is neither up nor down.
 */
export function signedQtyText(value: Quantity): string {
	// `negateQty`, not a hand-built `{ e6: -e6 }`. There is one place quantities are made and this
	// is not it — the same rule that keeps `Money` out of every screen's reach.
	if (value.e6 < 0) return MINUS + formatQty(negateQty(value));
	if (value.e6 > 0) return PLUS + formatQty(value);
	return formatQty(value);
}

export function unitPriceText(value: UnitPrice, opts: { symbol?: boolean } = {}): string {
	return formatUnitPrice(value, { symbol: opts.symbol ?? true });
}
