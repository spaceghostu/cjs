/**
 * HOW LONG A QUOTE LASTS.
 *
 * The calendar arithmetic itself moved to `$lib/core/calendar` when Invoicing needed the same
 * six functions — see the note at the top of that file. What is left here is the part that is
 * genuinely Quoting's: what a valid-until date MEANS, and the status that follows from it.
 *
 * The re-exports keep `$lib/core/quoting`'s surface exactly as it was, so nothing that imported
 * `addDays` or `formatShortDate` from this module had to move.
 */
import { daysBetween, type CalendarDate } from '$lib/core/calendar';

export {
	addDays,
	daysBetween,
	formatDocumentDate,
	formatShortDate,
	isCalendarDate,
	todayIn
} from '$lib/core/calendar';

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
