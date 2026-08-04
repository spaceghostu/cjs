/**
 * Proration, pinned.
 *
 * The design supplies exactly one worked example — Payroll at R120/mo added on 31 July —
 * and it is the first test below. Everything after it exists because a billing rule that is
 * only correct on the example it was written from is a rule that will be wrong in February.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { money } from './ctor';
import { sumMoney } from './math';
import { amountText } from '$lib/components/money/amount';
import {
	PRORATION_POLICY,
	billingDate,
	daysInBillingMonth,
	daysRemainingInMonth,
	firstOfNextMonth,
	isSameBillingDay,
	prorateDaysHeld,
	prorateRemainderOfMonth,
	quoteAddition
} from './proration';

const R = (rands: number, cents = 0) => money(rands * 100 + cents, 'ZAR');

const PAYROLL = R(120);

/** An instant at noon SAST on a civil date, which is unambiguously that date in both zones. */
const at = (year: number, month: number, day: number, hourSast = 12) =>
	new Date(Date.UTC(year, month - 1, day, hourSast - 2));

describe("the design's worked example", () => {
	it('adding Payroll on 31 July charges for the one remaining day', () => {
		const quote = quoteAddition(PAYROLL, at(2026, 7, 31));

		expect(quote.daysInMonth).toBe(31);
		expect(quote.daysCharged).toBe(1);
		// R120 / 31 = R3.8709..., rounded to the cent.
		expect(quote.today.cents).toBe(387);
	});

	it('shows that charge as R4 — the figure the design prints', () => {
		// The screen quotes whole rand; the ledger keeps the cent. Both are in the design,
		// and this is the test that stops someone "fixing" one to match the other.
		expect(amountText(prorateRemainderOfMonth(PAYROLL, at(2026, 7, 31)), { decimals: 0 })).toBe(
			'R4'
		);
	});

	it('quotes the new full total from 1 August', () => {
		const existing = R(450); // Quoting + Invoicing + Inventory
		const quote = quoteAddition(PAYROLL, at(2026, 7, 31));

		expect(sumMoney('ZAR', [existing, quote.monthly]).cents).toBe(R(570).cents);
		expect(billingDate(quote.nextChargeOn)).toEqual({ year: 2026, month: 8, day: 1 });
	});
});

describe('the policy constant', () => {
	it('is named and versioned, and is on every quote', () => {
		expect(PRORATION_POLICY).toBe('daily_days_in_month_half_away_v1');
		expect(quoteAddition(PAYROLL, at(2026, 7, 31)).policy).toBe(PRORATION_POLICY);
	});
});

describe('the calendar', () => {
	it('counts the real length of every month, leap years included', () => {
		expect(daysInBillingMonth(at(2026, 2, 1))).toBe(28);
		expect(daysInBillingMonth(at(2028, 2, 1))).toBe(29); // leap
		expect(daysInBillingMonth(at(2026, 4, 1))).toBe(30);
		expect(daysInBillingMonth(at(2026, 12, 1))).toBe(31);
	});

	it('rolls December into the next January', () => {
		expect(billingDate(firstOfNextMonth(at(2026, 12, 14)))).toEqual({
			year: 2027,
			month: 1,
			day: 1
		});
	});

	it('counts remaining days inclusive of today', () => {
		expect(daysRemainingInMonth(at(2026, 8, 1))).toBe(31);
		expect(daysRemainingInMonth(at(2026, 8, 31))).toBe(1);
	});

	/**
	 * The reason the boundary is SAST and not UTC. 01:00 on 1 August in Cape Town is 23:00 on
	 * 31 July in UTC — a naive calendar bills this person for a day of the wrong month.
	 */
	it('puts an early-morning South African instant in the right month', () => {
		const oneAmSast = new Date('2026-08-01T01:00:00+02:00');
		expect(billingDate(oneAmSast)).toEqual({ year: 2026, month: 8, day: 1 });
		expect(daysRemainingInMonth(oneAmSast)).toBe(31);
	});

	it('recognises the same billing day across the working hours of it', () => {
		expect(isSameBillingDay(at(2026, 7, 31, 8), at(2026, 7, 31, 23))).toBe(true);
		expect(isSameBillingDay(at(2026, 7, 31, 23), at(2026, 8, 1, 1))).toBe(false);
	});
});

describe('removal', () => {
	it('charges nothing when the module is removed the day it was added', () => {
		// "Remove it today and you're not charged at all."
		const day = at(2026, 7, 31, 9);
		expect(prorateDaysHeld(PAYROLL, day, at(2026, 7, 31, 17)).cents).toBe(0);
	});

	it('charges the days held, not counting the day of removal', () => {
		// Added 1 August, removed 11 August: ten days of a 31-day month.
		const charge = prorateDaysHeld(PAYROLL, at(2026, 8, 1), at(2026, 8, 11));
		expect(charge.cents).toBe(3871); // 12000 * 10 / 31 = 3870.96...
	});

	it('never charges more than a month, or less than nothing', () => {
		expect(prorateDaysHeld(PAYROLL, at(2026, 8, 20), at(2026, 8, 2)).cents).toBe(0);
		expect(prorateDaysHeld(PAYROLL, at(2026, 8, 1), at(2027, 8, 1)).cents).toBe(PAYROLL.cents);
	});
});

describe('properties', () => {
	const anyMonth = fc.record({
		year: fc.integer({ min: 2024, max: 2040 }),
		month: fc.integer({ min: 1, max: 12 })
	});
	const anyPriceCents = fc.integer({ min: 0, max: 5_000_000 });

	it('charges the full month when the module is added on the 1st', () => {
		fc.assert(
			fc.property(anyMonth, anyPriceCents, ({ year, month }, cents) => {
				const monthly = money(cents, 'ZAR');
				expect(prorateRemainderOfMonth(monthly, at(year, month, 1)).cents).toBe(cents);
			})
		);
	});

	/**
	 * NO DRIFT ACROSS A YEAR. Twelve month-start additions cost exactly twelve months.
	 *
	 * This is the property that would catch a divisor of 30, an off-by-one in the day count,
	 * or a rounding rule that leans one way — each of which loses or invents a few rand a year
	 * per customer, silently, forever.
	 */
	it('sums to exactly twelve months over a year of month-start additions', () => {
		fc.assert(
			fc.property(fc.integer({ min: 2024, max: 2040 }), anyPriceCents, (year, cents) => {
				const monthly = money(cents, 'ZAR');
				const charges = Array.from({ length: 12 }, (_, i) =>
					prorateRemainderOfMonth(monthly, at(year, i + 1, 1))
				);
				expect(sumMoney('ZAR', charges).cents).toBe(cents * 12);
			})
		);
	});

	it('never charges more than a month and never charges a negative amount', () => {
		fc.assert(
			fc.property(
				anyMonth,
				fc.integer({ min: 1, max: 31 }),
				anyPriceCents,
				({ year, month }, day, cents) => {
					const monthly = money(cents, 'ZAR');
					const on = at(year, month, Math.min(day, daysInBillingMonth(at(year, month, 1))));
					const charge = prorateRemainderOfMonth(monthly, on);
					expect(charge.cents).toBeGreaterThanOrEqual(0);
					expect(charge.cents).toBeLessThanOrEqual(cents);
				}
			)
		);
	});

	it('charges less the later in the month you add', () => {
		fc.assert(
			fc.property(anyMonth, anyPriceCents, ({ year, month }, cents) => {
				const monthly = money(cents, 'ZAR');
				const length = daysInBillingMonth(at(year, month, 1));
				let previous = Infinity;
				for (let day = 1; day <= length; day++) {
					const charge = prorateRemainderOfMonth(monthly, at(year, month, day)).cents;
					expect(charge).toBeLessThanOrEqual(previous);
					previous = charge;
				}
			})
		);
	});

	it('always lands the next charge on the 1st of the following month', () => {
		fc.assert(
			fc.property(anyMonth, fc.integer({ min: 1, max: 28 }), ({ year, month }, day) => {
				const next = billingDate(firstOfNextMonth(at(year, month, day)));
				expect(next.day).toBe(1);
				expect(next.month).toBe(month === 12 ? 1 : month + 1);
				expect(next.year).toBe(month === 12 ? year + 1 : year);
			})
		);
	});
});
