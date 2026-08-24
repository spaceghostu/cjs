/**
 * Money arithmetic. All of it. There is no other file that does maths on money.
 *
 * Every intermediate is BigInt, so exactness never depends on the magnitude of the inputs,
 * and every rounding decision in the entire product funnels through ONE function —
 * `roundDiv`. If the rounding rule ever has to change (see the s66(b) note on it), there is
 * exactly one place to change it and one place to test.
 */
import { money, quantity, rate } from './ctor';
import {
	MAX_CENTS,
	type CurrencyCode,
	type Money,
	type Quantity,
	type Rate,
	type UnitPrice
} from './types';

/**
 * THE ONLY ROUNDING FUNCTION IN THIS CODEBASE. Round half AWAY FROM ZERO.
 *
 * VAT Act s66(b): "fractions of less than half a cent must be rounded down; half a cent or
 * more must be rounded up."
 *
 * Two deliberate decisions, both of which someone will eventually want to "fix":
 *
 * 1. NOT banker's rounding — which is the default in most decimal libraries and in
 *    `Intl.NumberFormat`, and is NON-COMPLIANT here. Net R0.30 at 15% is raw R0.045:
 *    half-up gives R0.05 (correct per s66(b)), banker's gives R0.04. That is a defect on
 *    a legal document.
 *
 * 2. Half AWAY FROM ZERO, not half UP. Read literally, s66(b) rounds toward +infinity, so
 *    -R0.045 would be -R0.04. We round it to -R0.05 instead, because that is what makes a
 *    credit note EXACTLY reverse the invoice it credits. If the two disagreed by a cent,
 *    every fully-credited invoice would leave a one-cent residue on the customer's account
 *    forever. This is a considered deviation from the literal text, it only ever affects
 *    negative amounts, and it is item (f) on the tax practitioner's review list. Do not
 *    "correct" it without reading `math.test.ts`, which asserts the deviation on purpose.
 */
export function roundDiv(num: bigint, den: bigint): number {
	if (den <= 0n) throw new RangeError('roundDiv: denominator must be positive');
	const negative = num < 0n;
	const n = negative ? -num : num;
	const q = n / den;
	const r = n % den;
	const magnitude = r * 2n >= den ? q + 1n : q;
	const signed = negative ? -magnitude : magnitude;
	if (signed > BigInt(MAX_CENTS) || signed < -BigInt(MAX_CENTS)) {
		throw new RangeError(`roundDiv: result ${signed} is outside the exact integer range`);
	}
	return Number(signed);
}

function sameCurrency(a: { currency: string }, b: { currency: string }): void {
	// Unreachable through the type system (see NoInfer below); this is the runtime backstop
	// for values that crossed a boundary as plain JSON.
	if (a.currency !== b.currency) {
		throw new Error(`currency mismatch: ${a.currency} and ${b.currency} cannot be combined`);
	}
}

// ── Construction helpers that are safe to use anywhere ──────────────────────────────────

export function zero<C extends CurrencyCode>(currency: C): Money<C> {
	return money(0, currency);
}

export const ONE_UNIT: Quantity = quantity(1_000_000);
export const ZERO_RATE: Rate = rate(0);

// ── Comparison and combination ──────────────────────────────────────────────────────────
//
// `NoInfer` on the second parameter means TypeScript will not widen the currency to satisfy
// the call: adding a Money<'ZAR'> to a Money<'EUR'> is a COMPILE error the day a second
// currency exists, rather than a runtime throw discovered by a customer.

export function addMoney<C extends CurrencyCode>(a: Money<C>, b: NoInfer<Money<C>>): Money<C> {
	sameCurrency(a, b);
	return money(a.cents + b.cents, a.currency);
}

export function subMoney<C extends CurrencyCode>(a: Money<C>, b: NoInfer<Money<C>>): Money<C> {
	sameCurrency(a, b);
	return money(a.cents - b.cents, a.currency);
}

export function negateMoney<C extends CurrencyCode>(a: Money<C>): Money<C> {
	return money(-a.cents, a.currency);
}

export function absMoney<C extends CurrencyCode>(a: Money<C>): Money<C> {
	return money(Math.abs(a.cents), a.currency);
}

/** Currency is a parameter, not inferred from the list, so summing `[]` is still typed. */
export function sumMoney<C extends CurrencyCode>(
	currency: C,
	xs: readonly NoInfer<Money<C>>[]
): Money<C> {
	let total = 0n;
	for (const x of xs) {
		sameCurrency({ currency }, x);
		total += BigInt(x.cents);
	}
	if (total > BigInt(MAX_CENTS) || total < -BigInt(MAX_CENTS)) {
		throw new RangeError('sumMoney: total is outside the exact integer range');
	}
	return money(Number(total), currency);
}

export function cmpMoney<C extends CurrencyCode>(a: Money<C>, b: NoInfer<Money<C>>): -1 | 0 | 1 {
	sameCurrency(a, b);
	return a.cents < b.cents ? -1 : a.cents > b.cents ? 1 : 0;
}

export function eqMoney<C extends CurrencyCode>(a: Money<C>, b: NoInfer<Money<C>>): boolean {
	return a.currency === b.currency && a.cents === b.cents;
}

export const isZero = (m: Money): boolean => m.cents === 0;
export const isNegative = (m: Money): boolean => m.cents < 0;
export const isPositive = (m: Money): boolean => m.cents > 0;

// ── Quantity ────────────────────────────────────────────────────────────────────────────
//
// Quantities need the same treatment money gets, and for a narrower but real reason: stock on
// hand is a SUM OF MOVEMENTS, and `2.5 + 0.1` in floats is not `2.6`. A yard of boards counted
// in halves, a drum of oil drawn down in tenths of a litre — the same fractions that make
// `UnitPrice` necessary make float quantities wrong.
//
// These live here rather than in a module because `ctor.ts` is import-restricted to this
// directory (ESLint zone 5), so `$lib/core/inventory` has no other way to construct one. That
// restriction is the point: exact arithmetic has one home.

export const ZERO_QTY: Quantity = quantity(0);

export function addQty(a: Quantity, b: Quantity): Quantity {
	return quantity(a.e6 + b.e6);
}

export function subQty(a: Quantity, b: Quantity): Quantity {
	return quantity(a.e6 - b.e6);
}

export function negateQty(a: Quantity): Quantity {
	return quantity(-a.e6);
}

/**
 * The sum of a run of movements.
 *
 * BigInt for the same reason `sumMoney` uses it: each term is exact on its own, and only the
 * running total can leave the range where a double still is. A stock ledger is the longest
 * addition in the product — one row per movement, for years — so this is the function most
 * likely to meet that edge.
 */
export function sumQty(xs: readonly Quantity[]): Quantity {
	let total = 0n;
	for (const x of xs) total += BigInt(x.e6);
	if (total > BigInt(MAX_CENTS) || total < -BigInt(MAX_CENTS)) {
		throw new RangeError('sumQty: total is outside the exact integer range');
	}
	return quantity(Number(total));
}

export function cmpQty(a: Quantity, b: Quantity): -1 | 0 | 1 {
	return a.e6 < b.e6 ? -1 : a.e6 > b.e6 ? 1 : 0;
}

export function eqQty(a: Quantity, b: Quantity): boolean {
	return a.e6 === b.e6;
}

export const isQtyZero = (q: Quantity): boolean => q.e6 === 0;
export const isQtyNegative = (q: Quantity): boolean => q.e6 < 0;
export const isQtyPositive = (q: Quantity): boolean => q.e6 > 0;

// ── The three calculations every document does ──────────────────────────────────────────

/**
 * price (millionths of a rand) x quantity (millionths of a unit) -> cents.
 *
 * P*1e6 x Q*1e6 = P*Q*1e12; cents = that / 1e10. Done in BigInt, so a large quantity of a
 * high-precision unit price cannot overflow into approximation.
 */
export function lineAmount<C extends CurrencyCode>(price: UnitPrice<C>, qty: Quantity): Money<C> {
	return money(roundDiv(BigInt(price.micros) * BigInt(qty.e6), 10_000_000_000n), price.currency);
}

/** Apply a rate to an amount: VAT on an exclusive amount, or a percentage discount. */
export function applyRate<C extends CurrencyCode>(m: Money<C>, r: Rate): Money<C> {
	return money(roundDiv(BigInt(m.cents) * BigInt(r.ppm), 1_000_000n), m.currency);
}

/**
 * The VAT CONTAINED IN a VAT-inclusive amount.
 *
 * Exact rational arithmetic: ppm / (1e6 + ppm), which for 15% is 150000/1150000 = 15/115.
 *
 * NEVER the five-decimal literal 0.13043 that appears in a lot of accounting code — on
 * R1,000,000 that is R130,430.00 against the correct R130,434.78. R4.78 wrong, on one
 * invoice, silently.
 */
export function taxInInclusive<C extends CurrencyCode>(incl: Money<C>, r: Rate): Money<C> {
	if (r.ppm === 0) return zero(incl.currency);
	return money(
		roundDiv(BigInt(incl.cents) * BigInt(r.ppm), BigInt(1_000_000 + r.ppm)),
		incl.currency
	);
}

/**
 * Split `total` across `weights` so that the parts sum EXACTLY to the total — always.
 *
 * Largest-remainder (Hamilton) apportionment: give everyone their floor, then hand the
 * leftover cents to the largest remainders, breaking ties by index so the result is
 * deterministic. A document reprinted in 2033 renders to the same cent as the day it was
 * issued.
 *
 * Used for document-level discounts, deposit schedules, and allocating a payment across
 * invoices.
 *
 * NOTE ON SIGN: the maths is done on the MAGNITUDE and the sign reapplied at the end.
 * Doing it directly on a negative total looks like it works — the parts still sum to the
 * total, so a property test passes — but BigInt `%` truncates toward zero, so every
 * remainder comes out <= 0 and the descending sort hands the spare cents to the LEAST
 * deserving lines. Document discounts are negative by construction, so that would have
 * mis-spread every discount in the product, deterministically, forever.
 */
export function allocate<C extends CurrencyCode>(
	total: Money<C>,
	weights: readonly number[]
): Money<C>[] {
	if (weights.length === 0) {
		if (total.cents !== 0) {
			throw new RangeError('allocate: cannot distribute a non-zero total across zero weights');
		}
		return [];
	}
	if (weights.some((w) => !Number.isInteger(w))) {
		throw new RangeError('allocate: weights must be integers');
	}
	if (weights.some((w) => w < 0)) {
		// Largest-remainder is undefined for negative weights, and silently wrong if you let
		// it run. A negative line on a document is a separate decision (see the credit-note
		// paths); it must not arrive here by accident.
		throw new RangeError('allocate: weights must not be negative');
	}

	const T = BigInt(total.cents);
	const sign = T < 0n ? -1n : 1n;
	const amount = sign * T; // magnitude — see the sign note above

	let W = weights.map(BigInt);
	let sum = W.reduce((a, b) => a + b, 0n);

	// All weights zero (e.g. a document whose lines are all R0.00). There is no meaningful
	// proportion, so spread evenly — which still satisfies the invariant that the parts sum
	// to the total, where returning zeros would quietly lose money.
	if (sum === 0n) {
		W = weights.map(() => 1n);
		sum = BigInt(weights.length);
	}

	const base = W.map((w) => (amount * w) / sum);
	let remainder = amount - base.reduce((a, b) => a + b, 0n);

	const byRemainder = W.map((w, i) => ({ i, r: (amount * w) % sum })).sort((a, b) =>
		b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i
	);

	const out = [...base];
	for (const { i } of byRemainder) {
		if (remainder === 0n) break;
		out[i] += 1n;
		remainder -= 1n;
	}

	return out.map((c) => money(Number(sign * c), total.currency));
}
