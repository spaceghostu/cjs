import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseMoneyInput, parseQuantityInput, parseRateInput, parseUnitPriceInput } from './parse';
import { formatQty, formatUnitPrice, formatZar, moneyToDecimalString } from './format';
import { money, percent } from './ctor';

const cents = (raw: string) => {
	const r = parseMoneyInput(raw);
	if (!r.ok) throw new Error(`expected "${raw}" to parse, got: ${r.message}`);
	return r.value.cents;
};

const rejected = (raw: string) => {
	const r = parseMoneyInput(raw);
	expect(r.ok, `expected "${raw}" to be refused`).toBe(false);
	return r.ok ? '' : r.message;
};

describe('parsing what people actually type', () => {
	it('accepts the keyboard habit (full stop) and the SA convention (comma)', () => {
		expect(cents('1234.56')).toBe(123_456);
		expect(cents('1234,56')).toBe(123_456);
		expect(cents('1 234,56')).toBe(123_456);
		expect(cents('1 234.56')).toBe(123_456);
	});

	it('accepts currency decoration and our own formatted output', () => {
		expect(cents('R1234.56')).toBe(123_456);
		expect(cents('r 1234.56')).toBe(123_456);
		expect(cents('ZAR1234.56')).toBe(123_456);
		// Round-trip: whatever formatZar emits must parse back to the same number, including
		// its non-breaking thousands separator.
		expect(cents(formatZar(money(123_456, 'ZAR')))).toBe(123_456);
		expect(cents(formatZar(money(-987_654_321, 'ZAR')))).toBe(-987_654_321);
	});

	it('uses the LAST separator as the decimal when both appear', () => {
		expect(cents('1,234.56')).toBe(123_456);
		expect(cents('1.234,56')).toBe(123_456);
		expect(cents('1,234,567.89')).toBe(123_456_789);
		expect(cents('1.234.567,89')).toBe(123_456_789);
	});

	it('treats a SINGLE separator as the decimal, whichever kind it is', () => {
		// The deliberate resolution of "1,500". Trailing zeros are not extra precision.
		expect(cents('1,500')).toBe(150); // R1,50
		expect(cents('1.500')).toBe(150); // R1,50
		expect(cents('1,50')).toBe(150);
		expect(cents('1,5')).toBe(150);
		expect(cents('1500')).toBe(150_000); // no separator, no ambiguity
	});

	it('treats a REPEATED separator of one kind as grouping — nothing has two decimal points', () => {
		expect(cents('1.234.567')).toBe(123_456_700);
		expect(cents('1,234,567')).toBe(123_456_700);
	});

	it('handles signs, including accounting parentheses', () => {
		expect(cents('-1234.56')).toBe(-123_456);
		expect(cents('+1234.56')).toBe(123_456);
		expect(cents('(1234.56)')).toBe(-123_456);
		expect(cents('(R1 234,56)')).toBe(-123_456);
		expect(cents('(-100)')).toBe(10_000); // two negations
	});

	it('handles bare and partial numbers', () => {
		expect(cents('0')).toBe(0);
		expect(cents('100')).toBe(10_000);
		expect(cents('.5')).toBe(50);
		expect(cents(',5')).toBe(50);
		expect(cents('100.')).toBe(10_000);
	});

	it('never returns negative zero', () => {
		expect(Object.is(cents('-0'), 0)).toBe(true);
		expect(Object.is(cents('(0,00)'), 0)).toBe(true);
	});

	it('refuses more than two decimals rather than silently rounding', () => {
		// Quietly turning what someone typed into a different number is the exact defect
		// class the brief calls unacceptable.
		expect(rejected('10.005')).toMatch(/two decimals/);
		expect(rejected('1 234,5678')).toMatch(/two decimals/);
	});

	it('refuses nonsense with language a non-accountant can act on', () => {
		expect(rejected('')).toMatch(/Enter an amount/);
		expect(rejected('   ')).toMatch(/Enter an amount/);
		expect(rejected('abc')).toMatch(/doesn't look like an amount/);
		expect(rejected('12abc')).toMatch(/doesn't look like an amount/);
		expect(rejected('R')).toMatch(/Enter an amount/);
		expect(rejected('-')).toMatch(/Enter an amount/);
		expect(rejected('1e5')).toMatch(/doesn't look like an amount/);
		// Separators with no digits at all.
		expect(rejected(',')).toMatch(/Enter an amount/);
		expect(rejected('.')).toMatch(/Enter an amount/);
		expect(rejected('..')).toMatch(/Enter an amount/);
		expect(rejected('R-')).toMatch(/Enter an amount/);
	});

	it('accepts a sign and a symbol in either order', () => {
		expect(cents('-R100')).toBe(10_000 * -1);
		expect(cents('R-100')).toBe(-10_000);
		expect(cents('-ZAR100')).toBe(-10_000);
	});

	it('refuses an amount too large to stay exact', () => {
		expect(rejected('99999999999999999999')).toMatch(/too large/);
	});

	it('never throws, whatever it is handed', () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				const r = parseMoneyInput(s);
				return r.ok ? Number.isInteger(r.value.cents) : typeof r.message === 'string';
			}),
			{ numRuns: 3000 }
		);
	});
});

describe('unit prices carry six decimals', () => {
	it('keeps the precision that stops "R100 for 3" losing a cent', () => {
		const r = parseUnitPriceInput('33.333333');
		expect(r.ok && r.value.micros).toBe(33_333_333);
	});

	it('refuses a seventh decimal', () => {
		const r = parseUnitPriceInput('33.3333333');
		expect(r.ok).toBe(false);
		expect(!r.ok && r.message).toMatch(/six decimals/);
	});

	it('refuses nonsense, with the same plain language as money', () => {
		expect(parseUnitPriceInput('').ok).toBe(false);
		expect(parseUnitPriceInput('per hour').ok).toBe(false);
		const r = parseUnitPriceInput('abc');
		expect(!r.ok && r.message).toMatch(/doesn't look like an amount/);
	});

	it('accepts an explicit currency as well as defaulting to ZAR', () => {
		const m = parseMoneyInput('10', 'ZAR');
		expect(m.ok && m.value.currency).toBe('ZAR');
		const p = parseUnitPriceInput('10', 'ZAR');
		expect(p.ok && p.value.currency).toBe('ZAR');
	});

	it('round-trips through formatUnitPrice', () => {
		const r = parseUnitPriceInput(
			formatUnitPrice({ micros: 33_333_333, currency: 'ZAR' } as never)
		);
		expect(r.ok && r.value.micros).toBe(33_333_333);
	});
});

describe('quantities', () => {
	it('parses fractional quantities', () => {
		const e6 = (raw: string) => {
			const r = parseQuantityInput(raw);
			return r.ok ? r.value.e6 : null;
		};
		expect(e6('2.5')).toBe(2_500_000);
		expect(e6('2,5')).toBe(2_500_000);
		expect(e6('3')).toBe(3_000_000);
	});

	it('refuses a seventh decimal', () => {
		const r = parseQuantityInput('1.0000001');
		expect(r.ok).toBe(false);
	});

	it('refuses nonsense', () => {
		expect(parseQuantityInput('').ok).toBe(false);
		// "3 boxes" — people type the unit alongside the number.
		const r = parseQuantityInput('3 boxes');
		expect(!r.ok && r.message).toMatch(/doesn't look like an amount/);
	});

	it('round-trips through formatQty', () => {
		for (const e6 of [1_000_000, 2_500_000, 333_333, 0]) {
			const text = formatQty({ e6 } as never);
			const back = parseQuantityInput(text);
			expect(back.ok && back.value.e6).toBe(e6);
		}
	});
});

describe('parse/format round-trip', () => {
	it('formatZar output always parses back to the same cents', () => {
		fc.assert(
			fc.property(fc.integer({ min: -9_999_999_999, max: 9_999_999_999 }), (c) => {
				const m = money(c, 'ZAR');
				const r = parseMoneyInput(formatZar(m));
				return r.ok && r.value.cents === c;
			}),
			{ numRuns: 2000 }
		);
	});

	it('the machine form always parses back too', () => {
		fc.assert(
			fc.property(fc.integer({ min: -9_999_999_999, max: 9_999_999_999 }), (c) => {
				const r = parseMoneyInput(moneyToDecimalString(money(c, 'ZAR')));
				return r.ok && r.value.cents === c;
			}),
			{ numRuns: 2000 }
		);
	});
});

describe('percentages', () => {
	/**
	 * The fourth door. A deposit of "50% to start" is a number a person types, and without a
	 * sanctioned path it would either need a constructor (which ESLint refuses) or the server
	 * would have to trust an integer sent by a browser.
	 */
	it('reads a percentage the way somebody would write one', () => {
		expect(parseRateInput('50')).toEqual({ ok: true, value: percent(50) });
		expect(parseRateInput('50%')).toEqual({ ok: true, value: percent(50) });
		expect(parseRateInput(' 50 % ')).toEqual({ ok: true, value: percent(50) });
		expect(parseRateInput('12,5')).toEqual({ ok: true, value: percent(12.5) });
		expect(parseRateInput('12.5')).toEqual({ ok: true, value: percent(12.5) });
		expect(parseRateInput('0')).toEqual({ ok: true, value: percent(0) });
		expect(parseRateInput('100')).toEqual({ ok: true, value: percent(100) });
	});

	it('holds four decimal places of percent — one part per million', () => {
		const parsed = parseRateInput('0,0001');
		expect(parsed.ok && parsed.value.ppm).toBe(1);

		expect(parseRateInput('0,00001')).toEqual({
			ok: false,
			message: 'A percentage can have at most four decimals.'
		});
	});

	/**
	 * Bounded to 0–100, unlike `rate()` itself.
	 *
	 * `rate()` is deliberately unbounded — a 150% markup is a legitimate rate — but every
	 * percentage a PERSON types into this product is a share of something: a deposit, a
	 * discount, a VAT rate. This door is not the one such a value should come through.
	 */
	it('refuses a share that is not one', () => {
		expect(parseRateInput('-10')).toEqual({
			ok: false,
			message: 'A percentage cannot be negative.'
		});
		expect(parseRateInput('101')).toEqual({ ok: false, message: 'That is more than 100%.' });
		expect(parseRateInput('(50)')).toEqual({
			ok: false,
			message: 'A percentage cannot be negative.'
		});
	});

	it('refuses what is not a number at all', () => {
		expect(parseRateInput('')).toEqual({ ok: false, message: 'Enter an amount.' });
		expect(parseRateInput('%')).toEqual({ ok: false, message: 'Enter an amount.' });
		expect(parseRateInput('half').ok).toBe(false);
	});
});
