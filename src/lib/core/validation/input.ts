/**
 * MONEY AND QUANTITY, THROUGH THE ONE DOOR, WEARING THE STANDARD'S CLOTHES.
 *
 * `$lib/core/money` already owns every string -> number decision in this product: the space
 * thousands separator, the comma decimal, "R1 234,56" and "1,234.56" both landing on the same
 * cents, and the refusal to round "10.005" into a number nobody typed. That reasoning took a
 * file of its own to justify and it is not repeated here. THIS FILE PARSES NOTHING.
 *
 * What it does is dress the answer. `parseMoneyInput` returns `{ ok, message }`; the standard
 * wants `{ ok, message, problems }` with a field to anchor to and, where one exists, the thing
 * they probably meant. So every function here is: call the sanctioned parser, and on refusal
 * wrap its sentence in a `Problem`.
 *
 * WHY THIS FILE EXISTS AT ALL, INSTEAD OF COMPONENTS CALLING THE PARSER
 * --------------------------------------------------------------------
 * They still can, and `quoting/editor.ts` does. The reason to come through here is the
 * suggestion — and the reason the suggestion lives here rather than in the money core is that
 * the money core must not be in the business of guessing. Its refusal to turn "10.005" into
 * R10,01 is load-bearing; a "did you mean" is a different act, performed by a different layer,
 * that never changes a stored value on its own.
 *
 * WHAT THE SUGGESTION IS, AND THE ONE DIRECTION IT WILL NOT GO
 * -----------------------------------------------------------
 * Only the too-many-decimals case gets an offer, and the offer is the DECIMALS TRUNCATED, not
 * rounded:
 *
 *     "10.005"  ->  "An amount is exact to the cent — did you mean R10,00?"
 *
 * Truncation, not rounding to R10,01, because a suggestion that quietly increases what
 * somebody is charged is the one direction this product must never nudge. Being a cent light
 * on your own quote is your business; being a cent heavy on a client's invoice is an argument
 * about your integrity.
 *
 * The mechanism is deliberately blunt: shorten the decimal tail by one digit and ask the money
 * core again. It touches nothing before the last separator, so the magnitude cannot change —
 * "1 000,005" can only ever become "1 000,00", never "100,00" — and anything that is not a
 * number with a decimal tail gets no offer at all, because there is nothing honest to offer.
 */
import {
	formatQty,
	formatRate,
	formatUnitPrice,
	formatZar,
	parseMoneyInput,
	parseQuantityInput,
	parseRateInput,
	parseUnitPriceInput,
	type Money,
	type ParseResult,
	type Quantity,
	type Rate,
	type UnitPrice
} from '$lib/core/money';
import { invalid, problem, suggestion, valid, type Checked, type Suggestion } from './types';

/**
 * Any `ParseResult` as a `Checked`.
 *
 * The general adapter, exported because the money core is not the only thing in this codebase
 * that returns that shape and none of them should grow their own conversion.
 */
export function fromParseResult<T>(
	result: ParseResult<T>,
	options: { field?: string | null; suggestion?: Suggestion | null } = {}
): Checked<T> {
	if (result.ok) return valid(result.value);
	return invalid(problem(result.message, options));
}

/** "1 250,00" -> Money, or a sentence somebody can act on. */
export function checkAmount(raw: string, field: string | null = null): Checked<Money> {
	return offering(raw, parseMoneyInput, formatZar, field, 'An amount is exact to the cent');
}

/** "2,5" -> Quantity. */
export function checkQuantity(raw: string, field: string | null = null): Checked<Quantity> {
	return offering(raw, parseQuantityInput, formatQty, field, 'A quantity is exact to six decimals');
}

/** "33,333333" -> UnitPrice, to six decimals. */
export function checkUnitPrice(raw: string, field: string | null = null): Checked<UnitPrice> {
	return offering(
		raw,
		parseUnitPriceInput,
		formatUnitPrice,
		field,
		'A price is exact to six decimals'
	);
}

/** "50" or "50%" -> Rate. Bounded 0-100 by the parser, the door for a share of something. */
export function checkPercentage(raw: string, field: string | null = null): Checked<Rate> {
	return offering(raw, parseRateInput, formatRate, field, 'A percentage is exact to four decimals');
}

/**
 * Parse; and only if that failed, go looking for something to offer.
 *
 * The order matters more than it looks. Guessing costs several more parses, and these run on a
 * preview that re-derives itself while somebody types — so the guess is made on the failure
 * path only, where a person has already stopped and is reading.
 *
 * WHEN THERE IS AN OFFER, THE SENTENCE IS OURS.
 * `shorterDecimal` can only succeed by removing digits from the decimal tail, so an offer
 * existing IS the proof that the failure was precision and nothing else — an amount that is
 * too large or a percentage over 100 stays too large or over 100 however many decimals you
 * take off it. That is worth using, because the money core's own sentence for this case ends
 * with a "Try 1 250,00." hint and already contains an em dash; appended to an offer it would
 * read as two sentences arguing. So we say the short version and let the offer do the rest,
 * and every other failure keeps the money core's words exactly as written.
 */
function offering<T>(
	raw: string,
	parse: (input: string) => ParseResult<T>,
	show: (value: T) => string,
	field: string | null,
	tooPrecise: string
): Checked<T> {
	const parsed = parse(raw);
	if (parsed.ok) return valid(parsed.value);

	const offer = shorterDecimal(raw, parse, show);
	if (offer === null) return fromParseResult(parsed, { field });
	return invalid(problem(tooPrecise, { field, suggestion: offer }));
}

/**
 * Ask the money core again with one fewer decimal digit, and keep asking until it says yes.
 *
 * Bounded by the length of the decimal tail, and it never touches a character at or before the
 * last separator, so the whole part of the number is arithmetically untouchable. If there is no
 * separator, or the tail is not purely digits, or nothing shorter parses either, there is no
 * honest guess to make and the answer is null.
 */
function shorterDecimal<T>(
	raw: string,
	parse: (input: string) => ParseResult<T>,
	show: (value: T) => string
): Suggestion | null {
	const text = raw.trim();
	const cut = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
	if (cut < 0) return null;

	const tail = text.slice(cut + 1);
	if (tail.length < 2 || !/^\d+$/.test(tail)) return null;

	for (let keep = tail.length - 1; keep >= 1; keep--) {
		const attempt = parse(text.slice(0, cut + 1 + keep));
		if (attempt.ok) {
			const shown = show(attempt.value);
			return suggestion(`did you mean ${shown}?`, shown);
		}
	}
	return null;
}
