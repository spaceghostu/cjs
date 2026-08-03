/**
 * Turning money into text.
 *
 * Deliberately NOT `Intl.NumberFormat`. These strings go onto tax invoices that the owner's
 * customer reads and that SARS may inspect, and ICU output for en-ZA varies by platform and
 * Node build ("R 1 234,56" / "ZAR 1,234.56" / "R1,234.56"). A document must render the same
 * on a developer's laptop, in the PDF worker, and in a 2033 reprint. So the formatting is
 * done from integers, here, and it is testable.
 *
 * South African convention: space for thousands, comma for the decimal. R1 234,56.
 */
import type { Money, Quantity, Rate, UnitPrice } from './types';

/**
 * Non-breaking space, so "R1 234,56" never wraps mid-number across a line or a table cell.
 * That is a real defect on a printed quote, not a nicety.
 */
export const THOUSANDS_SEPARATOR = ' ';
export const DECIMAL_SEPARATOR = ',';

const SYMBOL: Record<string, string> = { ZAR: 'R' };

/** Group the whole part in threes, from the right. Integer string work only. */
function group(digits: string, separator: string): string {
	if (separator === '') return digits;
	let out = '';
	for (let i = 0; i < digits.length; i++) {
		if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
		out += digits[i];
	}
	return out;
}

/** Split a non-negative integer into whole/fraction at `scale` decimal places. */
function split(value: number, scale: number): { whole: string; frac: string } {
	const divisor = 10 ** scale;
	const frac = value % divisor;
	const whole = (value - frac) / divisor;
	return { whole: String(whole), frac: String(frac).padStart(scale, '0') };
}

export type FormatOptions = {
	/** Include the currency symbol. Default true. */
	symbol?: boolean;
	/** Group thousands. Default true. */
	grouping?: boolean;
	/**
	 * Show a negative as "-R100,00" (default) rather than "(R100,00)". Accounting
	 * parentheses are jargon; the brief's user is not an accountant.
	 */
	parens?: boolean;
};

export function formatZar(m: Money, opts: FormatOptions = {}): string {
	const { symbol = true, grouping = true, parens = false } = opts;
	const negative = m.cents < 0;
	const { whole, frac } = split(Math.abs(m.cents), 2);

	const body =
		(symbol ? (SYMBOL[m.currency] ?? `${m.currency} `) : '') +
		group(whole, grouping ? THOUSANDS_SEPARATOR : '') +
		DECIMAL_SEPARATOR +
		frac;

	if (!negative) return body;
	return parens ? `(${body})` : `-${body}`;
}

/**
 * A unit price, to as many decimals as it actually needs (2 minimum, 6 maximum).
 *
 * Trailing zeros beyond two are dropped: R33,333333 prints in full, but R120,00 does not
 * print as R120,000000 — which would read as a mistake to a customer.
 */
export function formatUnitPrice(p: UnitPrice, opts: FormatOptions = {}): string {
	const { symbol = true, grouping = true } = opts;
	const negative = p.micros < 0;
	const { whole, frac } = split(Math.abs(p.micros), 6);
	const trimmed = frac.replace(/0+$/, '').padEnd(2, '0');

	return (
		(negative ? '-' : '') +
		(symbol ? (SYMBOL[p.currency] ?? `${p.currency} `) : '') +
		group(whole, grouping ? THOUSANDS_SEPARATOR : '') +
		DECIMAL_SEPARATOR +
		trimmed
	);
}

/** A quantity: whole numbers stay whole ("3", not "3,000000"). */
export function formatQty(q: Quantity): string {
	const negative = q.e6 < 0;
	const { whole, frac } = split(Math.abs(q.e6), 6);
	const trimmed = frac.replace(/0+$/, '');
	return (negative ? '-' : '') + whole + (trimmed ? DECIMAL_SEPARATOR + trimmed : '');
}

/** ppm -> "15", "15.5", "0.075". Used in tax labels, which print on the document. */
export function formatRatePercent(ppm: number): string {
	const negative = ppm < 0;
	const { whole, frac } = split(Math.abs(ppm), 4);
	const trimmed = frac.replace(/0+$/, '');
	return (negative ? '-' : '') + whole + (trimmed ? `.${trimmed}` : '');
}

export function formatRate(r: Rate): string {
	return `${formatRatePercent(r.ppm)}%`;
}

/**
 * The MACHINE form: "1234.56". No symbol, no grouping, dot decimal.
 *
 * This is what goes into CSV and JSON exports, because GN 787 r3.2 requires SARS to be able
 * to "readily access, read and correctly analyse" the records — i.e. actually parse them.
 * A number formatted for humans is not machine-analysable.
 */
export function moneyToDecimalString(m: Money): string {
	const negative = m.cents < 0;
	const { whole, frac } = split(Math.abs(m.cents), 2);
	return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function unitPriceToDecimalString(p: UnitPrice): string {
	const negative = p.micros < 0;
	const { whole, frac } = split(Math.abs(p.micros), 6);
	return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function quantityToDecimalString(q: Quantity): string {
	const negative = q.e6 < 0;
	const { whole, frac } = split(Math.abs(q.e6), 6);
	return `${negative ? '-' : ''}${whole}.${frac}`;
}
