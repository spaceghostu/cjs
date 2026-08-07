/**
 * OVERDUE IS A FACT ABOUT THE CALENDAR, NOT A COLUMN.
 *
 * T19 is explicit: "`overdue` is derived from the due date, not stored — storing it guarantees a
 * stale row somewhere." An invoice becomes overdue at midnight, with nothing running and nobody
 * signed in. A stored flag would be right until the next morning and wrong for every business
 * whose sweeper had not reached them yet — and the list screen shows "Overdue" as a real count,
 * so a stale row there is a number an owner would act on.
 *
 * So the whole of the derivation is this file, and every list, badge, count and filter reads
 * through it.
 */
import { daysBetween, type CalendarDate } from '$lib/core/calendar';
import type { InvoiceStatus, StoredInvoiceStatus } from './types';

/**
 * Is this invoice past its due date?
 *
 * Inclusive of the day itself: an invoice due on the 1st is not late on the 1st. Anything else
 * would make "due 1 August" mean "due before 1 August", which is not what the client read on
 * the document.
 *
 * An invoice with no due date is never overdue. That is a deliberate reading of an empty field
 * — nobody set a date, so nothing has passed.
 */
export function isPastDue(dueDate: CalendarDate | null, today: CalendarDate): boolean {
	if (dueDate === null) return false;
	return daysBetween(dueDate, today) > 0;
}

/**
 * The status an invoice actually has right now.
 *
 * Only an invoice that is OUT and UNPAID can be overdue. A draft has not been issued to anybody;
 * a paid invoice cannot be late for a payment that has arrived; a cancelled one is not owed.
 *
 * `paid` deliberately does not appear as an input here — an invoice is `paid` in storage once it
 * is settled, and `settlement.ts` is what decides that. This function derives the one status
 * storage cannot hold.
 */
export function effectiveInvoiceStatus(
	stored: StoredInvoiceStatus,
	dueDate: CalendarDate | null,
	today: CalendarDate
): InvoiceStatus {
	if (stored !== 'sent' && stored !== 'viewed') return stored;
	return isPastDue(dueDate, today) ? 'overdue' : stored;
}

/** Money is still expected on this one. The list's "Unpaid" tab, and the "Owed to you" figure. */
export function isOutstanding(stored: StoredInvoiceStatus): boolean {
	return stored === 'sent' || stored === 'viewed';
}

/**
 * WHAT A CLIENT HAS SEEN, ONCE MONEY MOVES BACK.
 *
 * A reversal un-settles an invoice, so it has to return to the state it was in before the
 * payment — and that is `viewed` for a client who opened it and `sent` for one who never did.
 * Recomputed from the open count rather than remembered in a column, because a column would be
 * a second answer to a question `view_count` already answers.
 */
export function statusAfterSettlement(
	settled: boolean,
	viewCount: number
): Extract<StoredInvoiceStatus, 'paid' | 'sent' | 'viewed'> {
	if (settled) return 'paid';
	return viewCount > 0 ? 'viewed' : 'sent';
}
