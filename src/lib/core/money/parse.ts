/**
 * THE ONE PATH FROM HUMAN INPUT TO MONEY.
 *
 * Everything a person types about money arrives here. It never throws: it returns a result
 * with a plain-language message, because the brief's rule is to PREVENT errors rather than
 * report them, and because a thrown exception mid-quote is precisely the anxiety this
 * product exists to remove.
 *
 * SOUTH AFRICAN INPUT IS GENUINELY AMBIGUOUS. The official convention is "R1 234,56" —
 * space for thousands, comma for the decimal — but most people typing on a keyboard use a
 * full stop. Both have to work, and the rules below are chosen so that the common cases are
 * never surprising:
 *
 *   "1234.56"   -> R1 234,56     full stop as decimal (keyboard habit)
 *   "1234,56"   -> R1 234,56     comma as decimal (SA convention)
 *   "1 234,56"  -> R1 234,56     space thousands
 *   "R1,234.56" -> R1 234,56     both present: the LAST separator is the decimal
 *   "1.234,56"  -> R1 234,56     ...whichever way round they are
 *   "1.234.567" -> R1 234 567,00 a repeated separator can only be grouping
 *   "1,500"     -> R1,50         ONE separator is always the decimal (see below)
 *   "-R9 876,54"-> -R9 876,54    sign and currency in either order
 *
 * THE ONE AMBIGUOUS CASE, AND WHY IT RESOLVES THIS WAY.
 * A single separator followed by exactly three digits — "1,500" — could be one-and-a-half
 * or fifteen hundred. Treating it as grouping in some cases and a decimal in others is the
 * kind of rule that is right until the day it silently multiplies someone's invoice by a
 * thousand. So the rule is simply: ONE separator is a decimal, always. It matches the SA
 * locale (comma IS the decimal mark here), it matches the keyboard habit for full stops,
 * and it agrees with what the product itself displays everywhere — our formatter emits a
 * SPACE for thousands, so "R1 500,00" is the shape users see and copy.
 *
 * Trailing zeros are not extra precision: "1.500" is one and a half, and parses fine.
 * "10.005" is genuinely three decimals and is REFUSED rather than rounded — quietly turning
 * what someone typed into a different number is the defect class the brief calls
 * unacceptable.
 */
import { money, quantity, rate, unitPrice } from './ctor';
import {
	MAX_CENTS,
	type CurrencyCode,
	type Money,
	type Quantity,
	type Rate,
	type UnitPrice,
	ZAR
} from './types';

export type ParseResult<T> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

const fail = (message: string): ParseResult<never> => ({ ok: false, message });
const ok = <T>(value: T): ParseResult<T> => ({ ok: true, value });

type Normalised = { negative: boolean; whole: string; frac: string };

/** Strip decoration, resolve the separators, return the digit strings. Never rounds. */
function normalise(raw: string): ParseResult<Normalised> {
	let s = raw.trim();
	if (s === '') return fail('Enter an amount.');

	// Accounting parentheses mean negative.
	let negative = false;
	if (/^\(.*\)$/.test(s)) {
		negative = true;
		s = s.slice(1, -1).trim();
	}

	// Every flavour of space, including the non-breaking space our own formatter emits, so a
	// value copied out of the app pastes straight back in.
	s = s.replace(/[\s\u00a0\u202f']/g, '');

	// Sign and currency in either order: "-R100", "R-100", "-100". A loop, because a fixed
	// order would reject one of the two spellings — and "-R9 876,54" is exactly what our own
	// formatter produces for a negative amount.
	for (;;) {
		if (s.startsWith('-')) {
			negative = !negative;
			s = s.slice(1);
			continue;
		}
		if (s.startsWith('+')) {
			s = s.slice(1);
			continue;
		}
		const stripped = s.replace(/^(zar|r)/i, '');
		if (stripped !== s) {
			s = stripped;
			continue;
		}
		break;
	}

	if (s === '') return fail('Enter an amount.');
	if (!/^[\d.,]+$/.test(s)) {
		return fail("That doesn't look like an amount. Try something like 1 250,00.");
	}

	const lastDot = s.lastIndexOf('.');
	const lastComma = s.lastIndexOf(',');
	const separators = (s.match(/[.,]/g) ?? []).length;

	// ONE separator is always the decimal — see the note at the top of this file on why the
	// "1,500" ambiguity is resolved this way rather than by a cleverer rule.
	//
	// With more than one, all but the last must be grouping. The last is the decimal only
	// when the two KINDS are mixed ("1.234,56"); a repeated single kind ("1.234.567") can
	// only be grouping, because nothing has two decimal points.
	let decimalAt = -1;
	if (separators === 1 || (lastDot >= 0 && lastComma >= 0)) {
		decimalAt = Math.max(lastDot, lastComma);
	}

	const wholeRaw = decimalAt >= 0 ? s.slice(0, decimalAt) : s;
	const fracRaw = decimalAt >= 0 ? s.slice(decimalAt + 1) : '';

	// Grouping separators in the whole part are decoration; the fraction cannot contain one,
	// because `decimalAt` is by construction the LAST separator in the string.
	const whole = wholeRaw.replace(/[.,]/g, '');

	// Separators with no digits at all: ",", ".", "..".
	if (whole === '' && fracRaw === '') return fail('Enter an amount.');

	return ok({ negative, whole: whole === '' ? '0' : whole, frac: fracRaw });
}

function toScaledInteger(n: Normalised, scale: number, tooPrecise: string): ParseResult<number> {
	// Trailing zeros are not extra precision. "1.500" is one and a half, and must parse;
	// "10.005" is genuinely three decimals, and must not.
	const frac = n.frac.replace(/0+$/, '');
	if (frac.length > scale) return fail(tooPrecise);
	const digits = `${n.whole}${frac.padEnd(scale, '0')}`;
	// Parse via BigInt so a pasted 30-digit string cannot become a rounded double.
	const value = BigInt(digits);
	if (value > BigInt(MAX_CENTS)) return fail('That amount is too large.');
	return ok(Number(n.negative ? -value : value));
}

/** "1 250,00" -> Money. The only string -> Money path in the product. */
export function parseMoneyInput<C extends CurrencyCode = CurrencyCode>(
	raw: string,
	currency: C = ZAR as C
): ParseResult<Money<C>> {
	const n = normalise(raw);
	if (!n.ok) return n;
	const cents = toScaledInteger(
		n.value,
		2,
		'Amounts can have at most two decimals — cents. Try 1 250,00.'
	);
	if (!cents.ok) return cents;
	return ok(money(cents.value, currency));
}

/**
 * A unit price, to six decimals.
 *
 * Six, not two, because "R100 for 3" is R33,333333 each and storing R33,33 loses a cent on
 * every third line. Rounding to cents happens exactly once, at the line amount.
 */
export function parseUnitPriceInput<C extends CurrencyCode = CurrencyCode>(
	raw: string,
	currency: C = ZAR as C
): ParseResult<UnitPrice<C>> {
	const n = normalise(raw);
	if (!n.ok) return n;
	const micros = toScaledInteger(n.value, 6, 'A price can have at most six decimals.');
	if (!micros.ok) return micros;
	return ok(unitPrice(micros.value, currency));
}

/** "2,5" hours -> Quantity. */
export function parseQuantityInput(raw: string): ParseResult<Quantity> {
	const n = normalise(raw);
	if (!n.ok) return n;
	const e6 = toScaledInteger(n.value, 6, 'A quantity can have at most six decimals.');
	if (!e6.ok) return e6;
	return ok(quantity(e6.value));
}

/**
 * A PERCENTAGE somebody typed. "50" or "50%" or "12,5" -> Rate.
 *
 * The fourth door, and it exists for the same reason the other three do: a deposit of "50% to
 * start" is a number a person enters, and without a sanctioned path they would either be given
 * a constructor (which ESLint refuses, correctly) or the field would send a raw integer the
 * server has to trust.
 *
 * PERCENT IN, PARTS PER MILLION OUT. `Rate` counts in ppm, so 50% is 500 000 — the shift of
 * four decimal places happens here, once, and `toScaledInteger` does it exactly rather than by
 * multiplying a float by 10 000.
 *
 * Bounded to 0–100. Every rate a person types into this product is a share of something:
 * a deposit, a discount, a VAT rate. `rate()` itself is deliberately unbounded (a 150% markup
 * is a legitimate rate), and this door is not the one such a value should come through.
 */
export function parseRateInput(raw: string): ParseResult<Rate> {
	const n = normalise(raw.replace('%', ''));
	if (!n.ok) return n;

	// Four decimal places of percent is one part per million, which is the finest a `Rate`
	// can hold — and finer than anything a deposit or a discount is ever expressed in.
	const ppm = toScaledInteger(n.value, 4, 'A percentage can have at most four decimals.');
	if (!ppm.ok) return ppm;

	if (ppm.value < 0) return fail('A percentage cannot be negative.');
	if (ppm.value > 1_000_000) return fail('That is more than 100%.');

	return ok(rate(ppm.value));
}
