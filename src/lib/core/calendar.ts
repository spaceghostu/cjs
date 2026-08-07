/**
 * CALENDAR DATES, and why they are strings.
 *
 * "Valid until 22 August" is a promise about a day. So is "due Monday, 1 August". A `Date` is an
 * instant, and an instant carries a timezone whether you want one or not — so an invoice issued
 * at 23:30 in Johannesburg and read by a server thinking in UTC is due on the 31st for one of
 * them and the 1st for the other. The client has the 1st printed on their copy. They are right,
 * and the arithmetic has to agree with the paper.
 *
 * So a date here is `YYYY-MM-DD` and every operation on it is done in that space. Postgres
 * stores it in a `date` column, which is the same decision made once more.
 *
 * FORMATTING IS DONE BY HAND, for the same reason `money/format.ts` does not use `Intl`: ICU
 * output varies by platform and Node build, and a document has to render identically on a
 * developer's laptop, in the PDF worker, and in a 2033 reprint. A byte-stable PDF is an
 * acceptance criterion in T17, and a month name that depends on the host's ICU data is not
 * byte-stable.
 *
 * WHY THIS IS NOT IN `$lib/core/quoting`
 * --------------------------------------
 * It was, until Invoicing needed the same six functions. A module reaching into another
 * module's core for `addDays` is the first thread of exactly the coupling this architecture
 * spends ESLint zone 3 preventing — and "what day is it in Johannesburg" was never Quoting's
 * question in the first place. `quoting/validity.ts` re-exports from here, so nothing that
 * imported it before had to change.
 */

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

/**
 * The days, from Sunday — the order `Date.getUTCDay()` returns them in.
 *
 * Needed because the design's copy says "One is due on Monday", not "one is due on 2026-08-03".
 * Within the coming week a weekday is how a person actually holds a date.
 */
const WEEKDAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

/**
 * A calendar date, `YYYY-MM-DD`.
 *
 * A string rather than a `Date`, for the reason at the top of this file. Deliberately not a
 * branded type: it crosses the SvelteKit load boundary, goes into a `date` column and comes back
 * out of one, and every one of those hops would need an unwrap that earns nothing.
 */
export type CalendarDate = string;

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

/** "Monday". The design's due-date copy speaks in weekdays for the days near enough to name. */
export function weekdayName(date: CalendarDate): string {
	const { year, month, day } = parts(date);
	return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/**
 * "Monday, 1 August" — a day close enough that its name is the useful part.
 *
 * The design's invoice detail says "Due Monday, 1 August", which is how somebody would say it
 * out loud. Further out the weekday stops helping and `formatDocumentDate` is the honest form;
 * the caller decides which, because only the caller knows how far off the date is.
 */
export function formatWeekdayDate(date: CalendarDate): string {
	const { month, day } = parts(date);
	return `${weekdayName(date)}, ${day} ${MONTHS[month - 1]}`;
}
