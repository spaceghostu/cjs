/**
 * THE WORKED EXAMPLE: `2026/13/02`.
 *
 * The design shows exactly one validation message, and this is the file that has to make it
 * literally true:
 *
 *     "There's no 13th month — did you mean 2 Dec 2026?"
 *
 * Everything else in this module is machinery for reusing that sentence's shape. This is the
 * sentence itself.
 *
 * WHAT COUNTS AS A DATE SOMEBODY TYPED
 * ------------------------------------
 * Three numbers with something between them. Slashes, hyphens, dots or spaces — a person
 * copying "22-08-2026" out of an email should not have to retype it as slashes to be
 * understood. The ORDER is decided by which end carries the four-digit year:
 *
 *     2026/12/02   year first  -> year, month, day    (what the database stores)
 *     02/12/2026   year last   -> day, month, year    (what a South African writes)
 *     02/12/26     neither     -> REFUSED, with the probable year offered
 *
 * A two-digit year is refused rather than guessed AT SAVE TIME, but the guess is still made
 * and offered: "02/12/26" is almost certainly 2 Dec 2026, and saying so costs a click while
 * assuming it silently could put a quote's validity in 1926. Offering is the whole point of
 * the standard — the product proposes, the person decides.
 *
 * Note what is NOT accepted: month names, "next Tuesday", `Date.parse`. `Date.parse` on a
 * partial string is implementation-defined, differs between Node and browsers, and would let
 * "13/13/13" through as something. A date on a quote is a promise printed on paper; it does
 * not get to depend on which engine read it.
 *
 * THE ONE AMBIGUOUS CASE, AND WHY IT RESOLVES THIS WAY
 * ---------------------------------------------------
 * `2026/13/02` has two readings, and the design already picked one.
 *
 *   (a) The month is wrong. There is no month 13; the nearest real month is 12, and the day
 *       is left exactly as typed — 2 December 2026. ONE field is reinterpreted, by one.
 *   (b) The last two fields are transposed: they meant 13 February, having typed day before
 *       month out of habit. TWO fields are reinterpreted, and the suggested day (13) is a
 *       number they never typed in that position.
 *
 * We suggest (a), which is what the design shows. The reasoning is not "the design says so":
 * a suggestion is a claim about what someone MEANT, and the smaller the claim the likelier it
 * is right. "13 is one past 12" is one keystroke of explanation; "you swapped two fields and
 * therefore meant a different day of a different month" is a story. And because the standard
 * OFFERS rather than applies, being wrong about (a) costs a glance — the typed text is still
 * sitting in the field, untouched, for them to fix themselves.
 *
 * Every suggestion this file makes is a real day. A clamped month can leave a day that does
 * not exist in it (13/31 -> 12/31 is fine, 13/32 is not), so the clamp is applied to both
 * parts, in order. A suggestion that is itself invalid would be worse than no suggestion.
 */
import { formatShortDate, isCalendarDate, type CalendarDate } from '$lib/core/calendar';
import { at, problem, suggestion, valid, invalid, type Checked, type Problem } from './types';

/** What we tell somebody who typed something that is not three numbers at all. */
const SHAPE = 'Dates go in as day/month/year, like 02/12/2026';

/**
 * A date somebody typed, checked before it can be saved.
 *
 * Returns the canonical `YYYY-MM-DD` on success — the one form the rest of the product
 * speaks, so a screen that accepts "22-08-2026" still hands the database what it expects.
 */
export function checkCalendarDate(raw: string, field: string | null = null): Checked<CalendarDate> {
	const found = explainCalendarDate(raw);
	if (found === null) return valid(canonical(raw) as CalendarDate);
	return invalid(at(found, field));
}

/**
 * The same check, as a `Problem` or nothing.
 *
 * This is the form the zod bridge wants: a schema has already refused the value with
 * `refine(isCalendarDate)`, and this supplies the sentence and the suggestion that a `refine`
 * has no way to carry. `null` means "this reads as a date to me" — the schema refused it for
 * some other reason, and the bridge should fall back to its own copy.
 */
export function explainDate(input: unknown): Problem | null {
	if (typeof input !== 'string') return null;
	return explainCalendarDate(input);
}

function explainCalendarDate(raw: string): Problem | null {
	const text = raw.trim();
	if (text === '') return problem('Enter a date');

	const parts = text.split(/[\s./-]+/).filter((part) => part !== '');
	if (parts.length !== 3 || !parts.every((part) => /^\d{1,4}$/.test(part))) {
		return problem(SHAPE);
	}

	const [first, middle, last] = parts;

	if (first.length === 4) return checkParts(Number(first), Number(middle), Number(last));
	if (last.length === 4) return checkParts(Number(last), Number(middle), Number(first));

	// Neither end is a year. Offer the reading a South African almost certainly meant —
	// day/month/two-digit-year in this century — and let them confirm it.
	const guess = offer(2000 + Number(last), Number(middle), Number(first));
	return problem('Write the year in full, like 2026', { suggestion: guess });
}

function checkParts(year: number, month: number, day: number): Problem | null {
	// The year first, because everything below it is arithmetic that needs a real one. A
	// four-digit-looking "0026" is the same mistake as a two-digit "26" and gets the same
	// sentence and the same offer.
	if (year < 1000) {
		return problem('Write the year in full, like 2026', {
			suggestion: offer(2000 + (year % 100), month, day)
		});
	}

	if (month > 12) {
		return problem(`There's no ${ordinal(month)} month`, { suggestion: offer(year, 12, day) });
	}
	if (month < 1) {
		return problem('Months are numbered 1 to 12', { suggestion: offer(year, 1, day) });
	}

	const last = daysInMonth(year, month);
	if (day > last) {
		return problem(`There's no ${ordinal(day)} day in that month`, {
			suggestion: offer(year, month, last)
		});
	}
	if (day < 1) {
		return problem('Days are numbered from 1', { suggestion: offer(year, month, 1) });
	}

	return null;
}

/**
 * "did you mean 2 Dec 2026?", from parts that may still be out of range.
 *
 * Both parts are clamped, month first, because clamping the month can leave a day that month
 * does not have. `formatShortDate` does the words — the month names in this product are
 * written by hand in one place precisely so a suggestion and a printed document cannot
 * disagree about what "Dec" is.
 */
function offer(year: number, month: number, day: number) {
	// Every part is clamped, in order, because clamping one can invalidate the next: a month of
	// 13 becomes December, and only then is it known that the 31st is a real day. The year is
	// clamped too, and not for tidiness — `Date.UTC` reads a year below 100 as nineteen-hundred
	// and something, so an unclamped 26 would silently become 1926 and the suggestion would be
	// a date that fails the calendar's own check.
	const safeYear = clamp(year, 1000, 9999);
	const safeMonth = clamp(month, 1, 12);
	const safeDay = clamp(day, 1, daysInMonth(safeYear, safeMonth));
	const iso = isoDate(safeYear, safeMonth, safeDay);
	return suggestion(`did you mean ${formatShortDate(iso)} ${safeYear}?`, iso);
}

function clamp(value: number, low: number, high: number): number {
	if (value < low) return low;
	return value > high ? high : value;
}

/** Day 0 of the next month is the last day of this one. No table, no leap-year rule to get wrong. */
function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): CalendarDate {
	return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function pad(value: number, width: number): string {
	return String(value).padStart(width, '0');
}

/** 13 -> "13th", 21 -> "21st". The teens are the exception every naive version gets wrong. */
function ordinal(n: number): string {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	const unit = n % 10;
	if (unit === 1) return `${n}st`;
	if (unit === 2) return `${n}nd`;
	if (unit === 3) return `${n}rd`;
	return `${n}th`;
}

/**
 * The canonical form of an input this file has already accepted.
 *
 * Only ever called on a value `explainCalendarDate` returned null for, so the parts are known
 * good; the `isCalendarDate` guard is belt and braces against this file and that one drifting
 * apart, and turns a drift into a refusal rather than a bad row.
 */
function canonical(raw: string): string {
	const parts = raw
		.trim()
		.split(/[\s./-]+/)
		.filter((part) => part !== '');
	const [first, middle, last] = parts;
	const iso =
		first.length === 4
			? isoDate(Number(first), Number(middle), Number(last))
			: isoDate(Number(last), Number(middle), Number(first));
	/* v8 ignore next -- unreachable unless this file and calendar.ts disagree about a day */
	if (!isCalendarDate(iso)) throw new RangeError('validation and calendar disagree about a date');
	return iso;
}
