/**
 * PRORATION — "You're only charged for the days you have a module."
 *
 * That sentence is printed on the switcher, in the add confirmation and in the removal
 * confirmation, and this file is the only place it is true. Like `priceDocument`, the
 * behaviour is a NAMED, VERSIONED policy: money that changes behaviour silently between
 * releases is the failure mode this codebase is built to prevent, so a change to the
 * arithmetic here is a new constant, and a period already charged under the old one keeps
 * the old one.
 *
 * THE POLICY, IN THREE DECISIONS
 * ------------------------------
 *
 * 1. THE UNIT IS A DAY, AND THE DIVISOR IS THE DAYS IN THAT MONTH.
 *
 *    Not 1/30th of a month, and not an hour. The design's own worked example fixes it:
 *    adding Payroll (R120/mo) on 31 July charges for the last day of July, and 120/31 is
 *    R3.87 — which the screen shows as R4. A fixed 30-day divisor would have charged R4.00
 *    for a day of a 31-day month and overcharged every long month of the year.
 *
 * 2. THE DAY YOU ADD IS A DAY YOU HAVE IT. THE DAY YOU REMOVE IS NOT.
 *
 *    Adding on the 31st of a 31-day month charges one day. Removing on the day you added
 *    charges nothing, which is exactly what the confirmation promises: "Remove it today and
 *    you're not charged at all." The two rules are the same rule counted from opposite ends,
 *    and together they mean a module held for part of a day is charged either once or not at
 *    all — never twice, and never for a day nobody had it.
 *
 * 3. THE DAY BOUNDARY IS SOUTH AFRICAN, NOT UTC.
 *
 *    A person in Cape Town adding a module at 01:00 on 1 August is doing it in August, and
 *    a UTC calendar would bill them for the last day of July. SAST is UTC+2 with no daylight
 *    saving, ever, so this is a constant rather than a timezone database — see
 *    `BILLING_OFFSET_MINUTES`.
 *
 * Rounding is `roundDiv` like everything else: there is one rounding function in this
 * codebase, and proration does not get a second one.
 */
import { money } from './ctor';
import { roundDiv } from './math';
import type { CurrencyCode, Money } from './types';

/** Bump when the ARITHMETIC changes, never for a presentation change. See `VAT_POLICY`. */
export const PRORATION_POLICY = 'daily_days_in_month_half_away_v1' as const;
export type ProrationPolicy = typeof PRORATION_POLICY;

/**
 * SAST, in minutes. Fixed at UTC+2 since 1903 and with no daylight saving, which is why a
 * billing day boundary can be a number here instead of a zoneinfo lookup.
 */
export const BILLING_OFFSET_MINUTES = 120;

const MS_PER_MINUTE = 60_000;

/** A civil date in the billing zone: the calendar the customer is actually looking at. */
export type BillingDate = {
	readonly year: number;
	/** 1-12. Not the 0-11 that `Date` uses, because every off-by-one bug here is a wrong bill. */
	readonly month: number;
	readonly day: number;
};

/** The billing-zone calendar date an instant falls on. */
export function billingDate(instant: Date): BillingDate {
	const shifted = new Date(instant.getTime() + BILLING_OFFSET_MINUTES * MS_PER_MINUTE);
	return {
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate()
	};
}

/** Midnight, billing zone, on a civil date — as an instant. */
function instantAt(year: number, month: number, day: number): Date {
	return new Date(Date.UTC(year, month - 1, day) - BILLING_OFFSET_MINUTES * MS_PER_MINUTE);
}

/**
 * Days in the month an instant falls in. 28, 29, 30 or 31 — the divisor.
 *
 * `Date.UTC(y, m, 0)` is the last day of month `m` counted from zero, which is to say the
 * last day of the 1-based month `m`. Leap years come out of the calendar rather than out of
 * a rule somebody has to remember.
 */
export function daysInBillingMonth(instant: Date): number {
	const { year, month } = billingDate(instant);
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Days from this one to the end of the month, counting today.
 *
 * 31 July -> 1. 1 August -> 31. This is the numerator.
 */
export function daysRemainingInMonth(instant: Date): number {
	const { day } = billingDate(instant);
	return daysInBillingMonth(instant) - day + 1;
}

/** Midnight on the 1st of the following month — when the first full charge falls. */
export function firstOfNextMonth(instant: Date): Date {
	const { year, month } = billingDate(instant);
	return month === 12 ? instantAt(year + 1, 1, 1) : instantAt(year, month + 1, 1);
}

/**
 * Whole billing days from one instant to another, by CALENDAR rather than by elapsed time.
 *
 * 23:00 on the 1st to 01:00 on the 2nd is one day, not two hours. Days held is a question
 * about the calendar someone is billed against, and an elapsed-milliseconds answer would
 * charge differently depending on the hour of the click.
 *
 * `eslint-disable` on the floor: this divides a count of milliseconds into a count of days
 * on values that are exact multiples by construction, and has nothing to do with money —
 * the money division is `roundDiv`, below.
 */
function billingDaysBetween(from: Date, to: Date): number {
	const a = billingDate(from);
	const b = billingDate(to);
	const days = (d: BillingDate) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
	return days(b) - days(a);
}

/** Same calendar day in the billing zone. What "remove it today" means. */
export function isSameBillingDay(a: Date, b: Date): boolean {
	const x = billingDate(a);
	const y = billingDate(b);
	return x.year === y.year && x.month === y.month && x.day === y.day;
}

/**
 * WHAT IS CHARGED NOW for adding a module partway through a month.
 *
 * `monthly` x (days remaining, including today) / (days in this month), rounded once.
 *
 * On the 1st this is exactly `monthly`, with no rounding at all — which is the property that
 * keeps twelve month-start additions summing to exactly twelve months' price with no drift.
 */
export function prorateRemainderOfMonth<C extends CurrencyCode>(
	monthly: Money<C>,
	on: Date
): Money<C> {
	const days = daysRemainingInMonth(on);
	const inMonth = daysInBillingMonth(on);
	return money(roundDiv(BigInt(monthly.cents) * BigInt(days), BigInt(inMonth)), monthly.currency);
}

/**
 * WHAT IS CHARGED for a period that opened and closed inside one month.
 *
 * Zero when it opened and closed on the same day — the "remove today and you're not charged
 * at all" promise, stated as arithmetic so no caller has to remember it. Otherwise the days
 * held, counting the start day and not the end day.
 *
 * Only meaningful within a single month; a period that spans a month boundary has already
 * been billed for the months it crossed.
 */
export function prorateDaysHeld<C extends CurrencyCode>(
	monthly: Money<C>,
	startedAt: Date,
	endedAt: Date
): Money<C> {
	const inMonth = daysInBillingMonth(startedAt);
	const days = Math.min(Math.max(billingDaysBetween(startedAt, endedAt), 0), inMonth);
	return money(roundDiv(BigInt(monthly.cents) * BigInt(days), BigInt(inMonth)), monthly.currency);
}

/**
 * Everything the confirmation dialog has to state, computed once.
 *
 * The dialog's job is to answer "when does it take effect" with real numbers rather than a
 * paragraph, so the numbers are produced together, from one reading of the clock, and the
 * component renders them. A screen that computed `firstOfNextMonth` separately from the
 * charge could straddle midnight and print two different months.
 */
export type ProrationQuote<C extends CurrencyCode = CurrencyCode> = {
	readonly policy: ProrationPolicy;
	/** The monthly price this quote was made against. */
	readonly monthly: Money<C>;
	/** Charged now, for the rest of this month — including today. */
	readonly today: Money<C>;
	readonly daysCharged: number;
	readonly daysInMonth: number;
	/** When the first full monthly charge falls. */
	readonly nextChargeOn: Date;
};

export function quoteAddition<C extends CurrencyCode>(
	monthly: Money<C>,
	on: Date
): ProrationQuote<C> {
	return {
		policy: PRORATION_POLICY,
		monthly,
		today: prorateRemainderOfMonth(monthly, on),
		daysCharged: daysRemainingInMonth(on),
		daysInMonth: daysInBillingMonth(on),
		nextChargeOn: firstOfNextMonth(on)
	};
}
