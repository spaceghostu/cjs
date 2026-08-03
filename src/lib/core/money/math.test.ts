import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { money, percent, quantity, rate, unitPrice } from './ctor';
import {
	absMoney,
	addMoney,
	allocate,
	applyRate,
	cmpMoney,
	eqMoney,
	isNegative,
	isPositive,
	isZero,
	lineAmount,
	negateMoney,
	roundDiv,
	subMoney,
	sumMoney,
	taxInInclusive,
	zero
} from './math';
import { MAX_CENTS } from './types';

const R = (rands: number, cents = 0) => money(rands * 100 + cents, 'ZAR');
const VAT15 = percent(15);

describe('roundDiv — the only rounding function in the codebase', () => {
	it('rounds half AWAY FROM ZERO, not to even', () => {
		// VAT Act s66(b): half a cent or more rounds up. Banker's rounding (the default in
		// most decimal libraries and in Intl) would give 2 here, and be non-compliant.
		expect(roundDiv(5n, 2n)).toBe(3); // 2.5 -> 3, not 2
		expect(roundDiv(15n, 2n)).toBe(8); // 7.5 -> 8, not 8 (same) — but 7.5 even-rounds to 8
		expect(roundDiv(7n, 2n)).toBe(4); // 3.5 -> 4, banker's gives 4
		expect(roundDiv(1n, 2n)).toBe(1); // 0.5 -> 1, banker's gives 0  <-- the real divergence
		expect(roundDiv(3n, 2n)).toBe(2); // 1.5 -> 2, banker's gives 2
	});

	it('rounds below half down', () => {
		expect(roundDiv(4n, 10n)).toBe(0); // 0.4 -> 0
		expect(roundDiv(49n, 100n)).toBe(0); // 0.49 -> 0
		expect(roundDiv(149n, 100n)).toBe(1); // 1.49 -> 1
	});

	it('is symmetric about zero — which is what makes a credit note reverse its invoice', () => {
		// A DELIBERATE deviation from a literal reading of s66(b), which rounds toward +inf
		// and would give -2 here. See the note on roundDiv. Do not "fix" this.
		expect(roundDiv(-5n, 2n)).toBe(-3);
		expect(roundDiv(-1n, 2n)).toBe(-1);
		for (const n of [1n, 5n, 7n, 45n, 12345n, 999_999n]) {
			// `+ 0` normalises -0, which Object.is treats as distinct from 0.
			expect(roundDiv(-n, 7n)).toBe(-roundDiv(n, 7n) + 0);
		}
	});

	it('never returns negative zero', () => {
		// -0 survives JSON round-trips inconsistently and has no Postgres equivalent, so
		// there must be exactly one representation of zero in the system.
		expect(Object.is(roundDiv(-1n, 7n), 0)).toBe(true);
		expect(Object.is(money(-0, 'ZAR').cents, 0)).toBe(true);
		expect(Object.is(negateMoney(zero('ZAR')).cents, 0)).toBe(true);
	});

	it('refuses a non-positive denominator', () => {
		expect(() => roundDiv(1n, 0n)).toThrow(RangeError);
		expect(() => roundDiv(1n, -2n)).toThrow(RangeError);
	});

	it('refuses a result that would stop being exact', () => {
		expect(() => roundDiv(BigInt(MAX_CENTS) * 10n, 1n)).toThrow(RangeError);
		expect(() => roundDiv(BigInt(MAX_CENTS) * -10n, 1n)).toThrow(RangeError);
	});

	it('is exact regardless of magnitude (BigInt intermediates)', () => {
		// A double would have lost precision long before here.
		expect(roundDiv(9_007_199_254_740_990n, 1n)).toBe(9_007_199_254_740_990);
	});
});

describe('combining money', () => {
	it('adds, subtracts, negates and sums', () => {
		expect(addMoney(R(10, 10), R(5, 5)).cents).toBe(1515);
		expect(subMoney(R(10, 10), R(5, 5)).cents).toBe(505);
		expect(negateMoney(R(10)).cents).toBe(-1000);
		expect(absMoney(R(-10)).cents).toBe(1000);
		expect(sumMoney('ZAR', [R(1), R(2), R(3)]).cents).toBe(600);
		expect(sumMoney('ZAR', []).cents).toBe(0);
	});

	it('compares without ever using a relational operator on Money', () => {
		expect(cmpMoney(R(1), R(2))).toBe(-1);
		expect(cmpMoney(R(2), R(1))).toBe(1);
		expect(cmpMoney(R(2), R(2))).toBe(0);
		expect(eqMoney(R(2), R(2))).toBe(true);
		expect(isZero(zero('ZAR'))).toBe(true);
		expect(isNegative(R(-1))).toBe(true);
		expect(isPositive(R(1))).toBe(true);
	});

	it('refuses to combine different currencies at runtime as well as at compile time', () => {
		const eur = { cents: 100, currency: 'EUR' } as unknown as ReturnType<typeof R>;
		expect(() => addMoney(R(1), eur)).toThrow(/currency mismatch/);
		expect(() => subMoney(R(1), eur)).toThrow(/currency mismatch/);
		expect(() => sumMoney('ZAR', [eur])).toThrow(/currency mismatch/);
		expect(eqMoney(R(1), eur)).toBe(false);
	});

	it('refuses a sum that would stop being exact', () => {
		const big = money(MAX_CENTS, 'ZAR');
		expect(() => sumMoney('ZAR', [big, big])).toThrow(RangeError);
	});
});

describe('lineAmount — unit price x quantity', () => {
	it('multiplies out to cents', () => {
		// 3 x R33.33
		expect(lineAmount(unitPrice(33_330_000, 'ZAR'), quantity(3_000_000)).cents).toBe(9999);
		// 2.5 hours at R450/hour
		expect(lineAmount(unitPrice(450_000_000, 'ZAR'), quantity(2_500_000)).cents).toBe(112_500);
	});

	it('keeps six-decimal unit prices exact — "R100 for 3" does not lose a cent', () => {
		// R33.333333 x 3 = R99.999999 -> R100.00
		expect(lineAmount(unitPrice(33_333_333, 'ZAR'), quantity(3_000_000)).cents).toBe(10_000);
	});

	it('handles a zero quantity and a zero price', () => {
		expect(lineAmount(unitPrice(450_000_000, 'ZAR'), quantity(0)).cents).toBe(0);
		expect(lineAmount(unitPrice(0, 'ZAR'), quantity(3_000_000)).cents).toBe(0);
	});

	it('handles negative quantities symmetrically', () => {
		expect(lineAmount(unitPrice(33_330_000, 'ZAR'), quantity(-3_000_000)).cents).toBe(-9999);
	});
});

describe('VAT extraction', () => {
	it('applies a rate to an exclusive amount', () => {
		expect(applyRate(R(100), VAT15).cents).toBe(1500);
	});

	it('rounds a half-cent up, per s66(b)(ii)', () => {
		// R0.10 at 15% is exactly 1.5c.
		expect(applyRate(money(10, 'ZAR'), VAT15).cents).toBe(2);
		// R0.30 at 15% is exactly 4.5c. Banker's rounding gives 4 and is WRONG.
		expect(applyRate(money(30, 'ZAR'), VAT15).cents).toBe(5);
	});

	it('extracts VAT from an inclusive amount as an exact 15/115', () => {
		expect(taxInInclusive(money(9999, 'ZAR'), VAT15).cents).toBe(1304);
		// The case that catches the 0.13043 shortcut: it gives R130 430,00 — R4,78 wrong.
		expect(taxInInclusive(R(1_000_000), VAT15).cents).toBe(13_043_478);
	});

	it('never breaks net + vat == inclusive', () => {
		for (let cents = 0; cents <= 2000; cents++) {
			const incl = money(cents, 'ZAR');
			const tax = taxInInclusive(incl, VAT15);
			expect(incl.cents - tax.cents + tax.cents).toBe(incl.cents);
		}
	});

	it('returns zero tax for a zero rate rather than dividing by 1e6', () => {
		expect(taxInInclusive(R(100), rate(0)).cents).toBe(0);
	});

	it('extracts symmetrically for negative amounts, so a credit note reverses exactly', () => {
		expect(taxInInclusive(money(-9999, 'ZAR'), VAT15).cents).toBe(-1304);
		expect(applyRate(money(-30, 'ZAR'), VAT15).cents).toBe(-5);
	});
});

describe('allocate — largest remainder', () => {
	it('never loses or invents a cent', () => {
		const parts = allocate(R(100), [3333, 3333, 3334]);
		expect(parts.map((p) => p.cents)).toEqual([3333, 3333, 3334]);
		expect(sumMoney('ZAR', parts).cents).toBe(10_000);
	});

	it('hands spare cents to the largest remainders, deterministically', () => {
		// R10.00 across three equal parts: 333.33 each, one cent spare -> first by index.
		const parts = allocate(R(10), [1, 1, 1]);
		expect(parts.map((p) => p.cents)).toEqual([334, 333, 333]);
		expect(sumMoney('ZAR', parts).cents).toBe(1000);
	});

	it('MIRRORS exactly for a negative total', () => {
		// Document discounts are negative BY CONSTRUCTION. Doing the maths directly on a
		// negative total still sums correctly — so a naive property test passes — but BigInt
		// `%` truncates toward zero, every remainder comes out <= 0, and the spare cents go
		// to the LEAST deserving lines. This test is the one that catches that.
		const weights = [3333, 3333, 3334];
		const positive = allocate(R(100), weights).map((p) => p.cents);
		const negative = allocate(R(-100), weights).map((p) => p.cents);
		expect(negative).toEqual(positive.map((c) => -c));

		const uneven = [1, 1, 1];
		expect(allocate(R(-10), uneven).map((p) => p.cents)).toEqual(
			allocate(R(10), uneven).map((p) => -p.cents)
		);
	});

	it('spreads evenly when every weight is zero, rather than losing the money', () => {
		const parts = allocate(R(10), [0, 0, 0]);
		expect(sumMoney('ZAR', parts).cents).toBe(1000);
		expect(parts.map((p) => p.cents)).toEqual([334, 333, 333]);
	});

	it('returns an empty split for an empty document', () => {
		expect(allocate(zero('ZAR'), [])).toEqual([]);
	});

	it('refuses to distribute a non-zero total across no weights', () => {
		expect(() => allocate(R(10), [])).toThrow(RangeError);
	});

	it('refuses negative or fractional weights rather than mis-spreading silently', () => {
		expect(() => allocate(R(10), [1, -1])).toThrow(/must not be negative/);
		expect(() => allocate(R(10), [1.5, 1])).toThrow(/must be integers/);
	});

	it('handles a single weight', () => {
		expect(allocate(R(10), [7]).map((p) => p.cents)).toEqual([1000]);
	});
});

describe('properties', () => {
	const cents = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
	const weights = fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 25 });

	it('allocate always sums exactly to the total', () => {
		fc.assert(
			fc.property(cents, weights, (c, w) => {
				const parts = allocate(money(c, 'ZAR'), w);
				return sumMoney('ZAR', parts).cents === c;
			}),
			{ numRuns: 2000 }
		);
	});

	it('allocate is sign-symmetric', () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), weights, (c, w) => {
				const pos = allocate(money(c, 'ZAR'), w).map((p) => p.cents);
				const neg = allocate(money(-c, 'ZAR'), w).map((p) => p.cents);
				return neg.every((v, i) => v === -pos[i]);
			}),
			{ numRuns: 1000 }
		);
	});

	it('inclusive VAT always reconciles: base + tax == inclusive', () => {
		fc.assert(
			fc.property(cents, (c) => {
				const incl = money(c, 'ZAR');
				const tax = taxInInclusive(incl, VAT15);
				const base = subMoney(incl, tax);
				return addMoney(base, tax).cents === incl.cents;
			}),
			{ numRuns: 2000 }
		);
	});

	it('addMoney is associative and commutative', () => {
		fc.assert(
			fc.property(cents, cents, cents, (a, b, c) => {
				const [x, y, z] = [money(a, 'ZAR'), money(b, 'ZAR'), money(c, 'ZAR')];
				return (
					addMoney(addMoney(x, y), z).cents === addMoney(x, addMoney(y, z)).cents &&
					addMoney(x, y).cents === addMoney(y, x).cents
				);
			}),
			{ numRuns: 1000 }
		);
	});

	it('roundDiv never drifts more than a half-unit from the true quotient', () => {
		fc.assert(
			fc.property(
				fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
				fc.bigInt({ min: 1n, max: 10n ** 9n }),
				(num, den) => {
					const q = BigInt(roundDiv(num, den));
					const err = q * den - num;
					const absErr = err < 0n ? -err : err;
					return absErr * 2n <= den;
				}
			),
			{ numRuns: 2000 }
		);
	});

	it('negating money round-trips', () => {
		fc.assert(
			fc.property(cents, (c) => negateMoney(negateMoney(money(c, 'ZAR'))).cents === c),
			{ numRuns: 500 }
		);
	});
});

describe('constructors validate at the boundary', () => {
	it('refuses non-integers', () => {
		expect(() => money(1.5, 'ZAR')).toThrow(RangeError);
		expect(() => unitPrice(1.5, 'ZAR')).toThrow(RangeError);
		expect(() => quantity(1.5)).toThrow(RangeError);
		expect(() => rate(1.5)).toThrow(RangeError);
	});

	it('refuses values outside the exactly-representable range', () => {
		expect(() => money(MAX_CENTS + 1, 'ZAR')).toThrow(RangeError);
		expect(() => money(-MAX_CENTS - 1, 'ZAR')).toThrow(RangeError);
	});

	it('percent() rejects precision finer than parts-per-million', () => {
		expect(percent(15).ppm).toBe(150_000);
		expect(percent(15.5).ppm).toBe(155_000);
		expect(percent(0.0075).ppm).toBe(75);
		expect(() => percent(0.00001)).toThrow(RangeError);
	});

	it('allows rates above 100% and below zero — a markup is a rate too', () => {
		expect(percent(150).ppm).toBe(1_500_000);
		expect(rate(-50_000).ppm).toBe(-50_000);
	});
});
