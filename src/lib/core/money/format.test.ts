import { describe, it, expect } from 'vitest';
import { money, percent, quantity, rate, unitPrice } from './ctor';
import {
	DECIMAL_SEPARATOR,
	THOUSANDS_SEPARATOR,
	formatQty,
	formatRate,
	formatRatePercent,
	formatUnitPrice,
	formatZar,
	moneyToDecimalString,
	quantityToDecimalString,
	unitPriceToDecimalString
} from './format';

const R = (cents: number) => money(cents, 'ZAR');
const nb = THOUSANDS_SEPARATOR;

describe('formatZar', () => {
	it('uses the South African convention: space thousands, comma decimal', () => {
		expect(formatZar(R(123_456))).toBe(`R1${nb}234${DECIMAL_SEPARATOR}56`);
		expect(formatZar(R(100))).toBe('R1,00');
		expect(formatZar(R(0))).toBe('R0,00');
		expect(formatZar(R(5))).toBe('R0,05');
		expect(formatZar(R(50))).toBe('R0,50');
	});

	it('groups every three digits', () => {
		expect(formatZar(R(100_000_000))).toBe(`R1${nb}000${nb}000,00`);
		expect(formatZar(R(99_999_999_999))).toBe(`R999${nb}999${nb}999,99`);
	});

	it('uses a non-breaking thousands separator, so a printed number never wraps', () => {
		// A quote that breaks "R1 234,56" across two lines looks like a mistake to the
		// customer reading it.
		expect(THOUSANDS_SEPARATOR).toBe(' ');
		expect(formatZar(R(123_456))).not.toContain(' ');
	});

	it('shows a negative with a minus, not accounting parentheses, by default', () => {
		// Parentheses-as-negative is accountant jargon. The brief's user is not one.
		expect(formatZar(R(-123_456))).toBe(`-R1${nb}234,56`);
		expect(formatZar(R(-123_456), { parens: true })).toBe(`(R1${nb}234,56)`);
	});

	it('can drop the symbol and the grouping for table columns and inputs', () => {
		expect(formatZar(R(123_456), { symbol: false })).toBe(`1${nb}234,56`);
		expect(formatZar(R(123_456), { grouping: false })).toBe('R1234,56');
		expect(formatZar(R(123_456), { symbol: false, grouping: false })).toBe('1234,56');
	});

	it('never renders negative zero as "-R0,00"', () => {
		expect(formatZar(R(-0))).toBe('R0,00');
	});

	it('falls back to the ISO code for a currency with no symbol yet', () => {
		// The day the CurrencyCode union widens, an unmapped currency must render as
		// "EUR 1 234,56" rather than "undefined1 234,56".
		const eur = { cents: 123_456, currency: 'EUR' } as unknown as ReturnType<typeof R>;
		expect(formatZar(eur)).toBe(`EUR 1${nb}234,56`);
	});
});

describe('formatUnitPrice', () => {
	it('shows at least two decimals and at most six, without trailing noise', () => {
		expect(formatUnitPrice(unitPrice(120_000_000, 'ZAR'))).toBe('R120,00');
		expect(formatUnitPrice(unitPrice(33_333_333, 'ZAR'))).toBe('R33,333333');
		expect(formatUnitPrice(unitPrice(33_500_000, 'ZAR'))).toBe('R33,50');
		expect(formatUnitPrice(unitPrice(1_500_000, 'ZAR'))).toBe('R1,50');
	});

	it('groups and signs like money does', () => {
		expect(formatUnitPrice(unitPrice(1_234_560_000, 'ZAR'))).toBe(`R1${nb}234,56`);
		expect(formatUnitPrice(unitPrice(-1_500_000, 'ZAR'))).toBe('-R1,50');
	});

	it('can drop the symbol and grouping, and falls back to the ISO code', () => {
		expect(formatUnitPrice(unitPrice(1_234_560_000, 'ZAR'), { symbol: false })).toBe(
			`1${nb}234,56`
		);
		expect(formatUnitPrice(unitPrice(1_234_560_000, 'ZAR'), { grouping: false })).toBe('R1234,56');
		const eur = { micros: 1_500_000, currency: 'EUR' } as unknown as ReturnType<typeof unitPrice>;
		expect(formatUnitPrice(eur)).toBe('EUR 1,50');
	});
});

describe('formatQty', () => {
	it('keeps whole numbers whole', () => {
		expect(formatQty(quantity(3_000_000))).toBe('3');
		expect(formatQty(quantity(1_000_000))).toBe('1');
		expect(formatQty(quantity(0))).toBe('0');
	});

	it('shows only the decimals that exist', () => {
		expect(formatQty(quantity(2_500_000))).toBe('2,5');
		expect(formatQty(quantity(333_333))).toBe('0,333333');
		expect(formatQty(quantity(-2_500_000))).toBe('-2,5');
	});
});

describe('rates', () => {
	it('formats without trailing zeros', () => {
		expect(formatRatePercent(150_000)).toBe('15');
		expect(formatRatePercent(155_000)).toBe('15.5');
		expect(formatRatePercent(75)).toBe('0.0075');
		expect(formatRatePercent(0)).toBe('0');
		expect(formatRatePercent(-150_000)).toBe('-15');
		expect(formatRate(percent(15))).toBe('15%');
		expect(formatRate(rate(0))).toBe('0%');
	});
});

describe('the machine form for CSV and JSON export', () => {
	it('is plain, dot-decimal and ungrouped, so SARS can actually analyse it', () => {
		// GN 787 r3.2 requires records SARS can "readily access, read and correctly
		// analyse". A number formatted for humans is not machine-analysable.
		expect(moneyToDecimalString(R(123_456))).toBe('1234.56');
		expect(moneyToDecimalString(R(-5))).toBe('-0.05');
		expect(moneyToDecimalString(R(0))).toBe('0.00');
		expect(unitPriceToDecimalString(unitPrice(33_333_333, 'ZAR'))).toBe('33.333333');
		expect(quantityToDecimalString(quantity(2_500_000))).toBe('2.500000');
	});

	it('always keeps its full scale, so a spreadsheet column stays aligned', () => {
		expect(moneyToDecimalString(R(100))).toBe('1.00');
		expect(unitPriceToDecimalString(unitPrice(1_000_000, 'ZAR'))).toBe('1.000000');
	});

	it('signs negatives', () => {
		expect(unitPriceToDecimalString(unitPrice(-33_333_333, 'ZAR'))).toBe('-33.333333');
		expect(quantityToDecimalString(quantity(-2_500_000))).toBe('-2.500000');
	});
});
