/**
 * CALENDAR DATES, and why they are strings.
 *
 * "Valid until 22 August" is a promise about a day. A `Date` is an instant, and an instant
 * carries a timezone whether you want one or not — so a quote created at 23:30 in Johannesburg
 * and read by a server thinking in UTC is valid until the 21st for one of them and the 22nd for
 * the other. The client has the 22nd printed on their copy. They are right, and the arithmetic
 * has to agree with the paper.
 *
 * So a date here is `YYYY-MM-DD` and every operation on it is done in that space. Postgres
 * stores it in a `date` column, which is the same decision made once more.
 *
 * FORMATTING IS DONE BY HAND, for the same reason `format.ts` does not use `Intl`:
 * ICU output varies by platform and Node build, and a document has to render identically on a
 * developer's laptop, in the PDF worker, and in a 2033 reprint. A byte-stable PDF is an
 * acceptance criterion in T17, and a month name that depends on the host's ICU data is not
 * byte-stable.
 */
import type { CalendarDate } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

/** Is this a well-formed calendar date that names a day that exists? */
export function isCalendarDate(value: unknown): value is CalendarDate {
	if (typeof value !== 'string') return false;
	const match = ISO_DATE.exec(value);
	if (!match) return false;

	// `2026-02-30` matches the pattern and is not a day. Round-tripping through UTC catches it
	// without ever leaving the calendar: the parts go in, and if the parts do not come back the
	// date did not exist.
	const [, y, m, d] = match;
	const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
	return (
		utc.getUTCFullYear() === Number(y) &&
		utc.getUTCMonth() === Number(m) - 1 &&
		utc.getUTCDate() === Number(d)
	);
}

function parts(date: CalendarDate): { year: number; month: number; day: number } {
	const match = ISO_DATE.exec(date);
	if (!match) throw new RangeError(`not a calendar date: ${JSON.stringify(date)}`);
	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function fromUtc(ms: number): CalendarDate {
	const d = new Date(ms);
	const year = String(d.getUTCFullYear()).padStart(4, '0');
	const month = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * The calendar day an instant falls on, in a named zone.
 *
 * `timeZone` is a parameter and never defaulted to the host's, because the host is a container
 * that is almost certainly on UTC while the business is in Johannesburg. The business's zone
 * comes from its locale settings; today, everything is `Africa/Johannesburg`.
 *
 * This is the ONE place `Intl` is used, and it is used for a zone offset rather than for
 * presentation — the answer is a number of hours, which does not vary between ICU versions the
 * way a formatted month name does.
 */
export function todayIn(now: Date, timeZone = 'Africa/Johannesburg'): CalendarDate {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	// en-CA is ISO-ordered by definition (`2026-08-04`), which is what makes this a lookup of
	// the DAY rather than a rendering of it.
	return formatter.format(now);
}

/** `2026-08-04` + 14 days -> `2026-08-18`. Month and year roll over correctly. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
	const { year, month, day } = parts(date);
	return fromUtc(Date.UTC(year, month - 1, day + days));
}

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	const a = parts(from);
	const b = parts(to);
	const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
	return ms / 86_400_000;
}

/**
 * Has this quote's validity passed?
 *
 * Inclusive of the day itself: a quote valid until the 22nd can be accepted all day on the
 * 22nd. Anything else would make "valid until" mean "valid before", which is not what the
 * client read.
 *
 * A quote with no valid-until never expires. That is a deliberate reading of an empty field —
 * the business did not set a limit, so there is not one.
 */
export function hasExpired(validUntil: CalendarDate | null, today: CalendarDate): boolean {
	if (validUntil === null) return false;
	return daysBetween(validUntil, today) > 0;
}

/**
 * The status a quote actually has right now.
 *
 * Expiry is reached by the calendar rather than by an act, so the stored status can be a day
 * out of date through no fault of anyone's. Deriving it on read means a quote is never
 * offered for acceptance after the date printed on it, even if nothing has swept yet — the
 * sweeper's job is to make the stored value agree, not to be the only thing that knows.
 *
 * Only `sent` and `viewed` can expire. An accepted quote stays accepted forever; a declined
 * one stays declined; a draft has not been offered to anybody.
 */
export function effectiveStatus<S extends string>(
	status: S,
	validUntil: CalendarDate | null,
	today: CalendarDate
): S | 'expired' {
	if (status !== 'sent' && status !== 'viewed') return status;
	return hasExpired(validUntil, today) ? 'expired' : status;
}

/** "22 August 2026". What prints on the document. */
export function formatDocumentDate(date: CalendarDate): string {
	const { year, month, day } = parts(date);
	return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "22 Aug" — the shorter form the interface uses, where the year is obvious from context. */
export function formatShortDate(date: CalendarDate): string {
	const { month, day } = parts(date);
	return `${day} ${MONTHS[month - 1].slice(0, 3)}`;
}
