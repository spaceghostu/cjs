/**
 * THE ONLY WAY TO CONSTRUCT MONEY.
 *
 * Importing this file is restricted by ESLint (rule 5 in eslint.config.js) to exactly three
 * places:
 *
 *   1. `$lib/core/money/**`  — the money module itself
 *   2. `db/map.ts`           — database rows -> domain values
 *   3. tests
 *
 * Everywhere else, money enters the system through `parseMoneyInput` (from a human) or
 * through `db/map.ts` (from a row), and leaves through `formatZar`. There is no fourth
 * door. That is what makes "a module author cannot do float maths on money" true rather
 * than merely documented: they can compute `a.cents * 1.15` all they like, but they have
 * nowhere to put the answer.
 *
 * Every constructor here validates. An out-of-range or non-integer value throws at the
 * boundary rather than becoming a wrong number on someone's invoice.
 */
import {
	MAX_CENTS,
	type CurrencyCode,
	type Money,
	type Quantity,
	type Rate,
	type UnitPrice
} from './types';

/**
 * Validate, and normalise negative zero away.
 *
 * `-0` arises naturally — negating a zero discount, reversing a zero-value credit note —
 * and it is a genuine hazard: `Object.is(-0, 0)` is false, `JSON.stringify(-0)` is `"0"`,
 * and Postgres has no such value. So a Money could compare unequal to itself across a
 * round-trip through the database or the SvelteKit load boundary. Normalising here means
 * there is exactly one representation of zero in the system.
 */
function toSafeInteger(v: number, what: string): number {
	if (!Number.isInteger(v)) {
		throw new RangeError(`${what} must be an integer, got ${v}`);
	}
	if (v > MAX_CENTS || v < -MAX_CENTS) {
		throw new RangeError(`${what} is outside the exactly-representable range: ${v}`);
	}
	return v === 0 ? 0 : v;
}

/** @internal Construct Money from integer cents. */
export function money<C extends CurrencyCode>(cents: number, currency: C): Money<C> {
	return { cents: toSafeInteger(cents, 'money cents'), currency } as Money<C>;
}

/** @internal Construct a unit price from millionths of a rand. */
export function unitPrice<C extends CurrencyCode>(micros: number, currency: C): UnitPrice<C> {
	return { micros: toSafeInteger(micros, 'unit price micros'), currency } as UnitPrice<C>;
}

/** @internal Construct a quantity from millionths of a unit. */
export function quantity(e6: number): Quantity {
	return { e6: toSafeInteger(e6, 'quantity e6') } as Quantity;
}

/**
 * @internal Construct a rate from parts per million.
 *
 * Deliberately NOT range-limited to [0, 1_000_000]: a 150% markup is a legitimate rate, and
 * so is a negative adjustment. Only nonsense (non-integer, unrepresentable) is refused.
 */
export function rate(ppm: number): Rate {
	return { ppm: toSafeInteger(ppm, 'rate ppm') } as Rate;
}

/** 15% -> rate(150_000). A readability helper for specs and tests, not a parsing path. */
export function percent(p: number): Rate {
	const ppm = p * 10_000;
	if (!Number.isInteger(ppm)) {
		throw new RangeError(
			`${p}% is finer than parts-per-million (max 4 decimal places); use rate() directly`
		);
	}
	return rate(ppm);
}
