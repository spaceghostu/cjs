import { describe, expect, it } from 'vitest';
import { money, quantity, unitPrice } from '$lib/core/money/ctor';
import {
	MINUS,
	PLUS,
	amountClass,
	amountText,
	qtyText,
	unitPriceText,
	type AmountSize,
	type AmountTone
} from './amount.js';

const R = (cents: number) => money(cents, 'ZAR');
const nb = ' ';

describe('amountText', () => {
	it('renders the figures the design shows', () => {
		// The design's decimal mark is a full stop; this codebase keeps the South African
		// comma, which is `DECIMAL_SEPARATOR` in the money core. That is a deliberate,
		// recorded divergence — the shape, grouping and sign below are the design's.
		expect(amountText(R(8_420_000), { decimals: 0 })).toBe(`R84${nb}200`);
		expect(amountText(R(4_876_000))).toBe(`R48${nb}760,00`);
		expect(amountText(R(-712_000), { signed: true, decimals: 0 })).toBe(`${MINUS}R7${nb}120`);
		expect(amountText(R(114_000), { signed: true, decimals: 0 })).toBe(`${PLUS}R1${nb}140`);
	});

	it('uses U+2212, never a hyphen', () => {
		// Next to tabular figures a hyphen reads as a dash rather than a sign.
		expect(amountText(R(-100))).toContain(MINUS);
		expect(amountText(R(-100))).not.toContain('-');
		expect(amountText(R(-100), { signed: true })).not.toContain('-');
	});

	it('shows a real minus even when `signed` is off', () => {
		// `signed` decides whether a POSITIVE gets a +. A negative is negative regardless.
		expect(amountText(R(-2_500))).toBe('−R25,00');
		expect(amountText(R(-2_500), { signed: true })).toBe('−R25,00');
	});

	it('never signs a zero', () => {
		// A variance of nothing is neither up nor down.
		expect(amountText(R(0), { signed: true })).toBe('R0,00');
		expect(amountText(R(0), { signed: true, decimals: 0 })).toBe('R0');
		expect(amountText(R(-0), { signed: true })).toBe('R0,00');
	});

	describe('decimals', () => {
		it('2 is the default, because a document must show cents', () => {
			expect(amountText(R(2_480_000))).toBe(`R24${nb}800,00`);
			expect(amountText(R(2_480_000), { decimals: 2 })).toBe(`R24${nb}800,00`);
		});

		it('0 rounds to whole rand for a screen summary', () => {
			expect(amountText(R(2_480_050), { decimals: 0 })).toBe(`R24${nb}801`);
			expect(amountText(R(2_480_049), { decimals: 0 })).toBe(`R24${nb}800`);
		});

		it('rounds the magnitude, so a negative rounds away from zero too', () => {
			expect(amountText(R(-150), { decimals: 0 })).toBe(`${MINUS}R2`);
			expect(amountText(R(-149), { decimals: 0 })).toBe(`${MINUS}R1`);
		});
	});

	describe('symbol', () => {
		it('can be dropped for a column that carries the R in its header', () => {
			expect(amountText(R(2_480_000), { symbol: false })).toBe(`24${nb}800,00`);
			expect(amountText(R(-2_480_000), { symbol: false, signed: true })).toBe(
				`${MINUS}24${nb}800,00`
			);
		});
	});

	describe('every signed × decimals combination', () => {
		const CASES: [number, boolean, 2 | 0, string][] = [
			[123_456, false, 2, `R1${nb}234,56`],
			[123_456, false, 0, `R1${nb}235`],
			[123_456, true, 2, `${PLUS}R1${nb}234,56`],
			[123_456, true, 0, `${PLUS}R1${nb}235`],
			[-123_456, false, 2, `${MINUS}R1${nb}234,56`],
			[-123_456, false, 0, `${MINUS}R1${nb}235`],
			[-123_456, true, 2, `${MINUS}R1${nb}234,56`],
			[-123_456, true, 0, `${MINUS}R1${nb}235`],
			[0, false, 2, 'R0,00'],
			[0, false, 0, 'R0'],
			[0, true, 2, 'R0,00'],
			[0, true, 0, 'R0']
		];

		it.each(CASES)('%i signed=%s decimals=%i -> %s', (cents, signed, decimals, expected) => {
			expect(amountText(R(cents), { signed, decimals })).toBe(expected);
		});
	});
});

describe('amountClass', () => {
	const SIZES: AmountSize[] = ['sm', 'md', 'lg', 'xl', 'hero'];
	const TONES: AmountTone[] = ['default', 'owed', 'settled', 'muted'];

	it('is always mono and tabular, whatever the size and tone', () => {
		for (const size of SIZES) {
			for (const tone of TONES) {
				expect(amountClass(size, tone)).toContain('numeric');
			}
		}
	});

	it('tightens the tracking at lg and up, and not below', () => {
		expect(amountClass('sm')).not.toContain('tracking');
		expect(amountClass('md')).not.toContain('tracking');
		for (const size of ['lg', 'xl', 'hero'] as const) {
			expect(amountClass(size)).toContain('tracking-[-0.02em]');
		}
	});

	it('gives each size its own type size', () => {
		const sizes = SIZES.map((size) => amountClass(size));
		expect(new Set(sizes).size).toBe(SIZES.length);
	});

	it('gives each tone its own colour, and defaults to plain text', () => {
		// Money is neutral. Colour flags an exception; it does not decorate a figure.
		expect(amountClass()).toContain('text-ink');
		expect(amountClass('md', 'default')).toContain('text-ink');
		expect(amountClass('md', 'owed')).toContain('text-invoicing');
		expect(amountClass('md', 'settled')).toContain('text-settled');
		expect(amountClass('md', 'muted')).toContain('text-ink-muted');

		const tones = TONES.map((tone) => amountClass('md', tone));
		expect(new Set(tones).size).toBe(TONES.length);
	});

	it('defaults to md and default', () => {
		expect(amountClass()).toBe(amountClass('md', 'default'));
	});
});

describe('qtyText', () => {
	it('keeps whole numbers whole', () => {
		expect(qtyText(quantity(3_000_000))).toBe('3');
		expect(qtyText(quantity(2_500_000))).toBe('2,5');
	});
});

describe('unitPriceText', () => {
	it('shows as many decimals as the price actually has', () => {
		expect(unitPriceText(unitPrice(120_000_000, 'ZAR'))).toBe('R120,00');
		expect(unitPriceText(unitPrice(33_333_333, 'ZAR'))).toBe('R33,333333');
	});

	it('can drop the symbol', () => {
		expect(unitPriceText(unitPrice(120_000_000, 'ZAR'), { symbol: false })).toBe('120,00');
	});
});
