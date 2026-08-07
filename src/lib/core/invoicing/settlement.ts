/**
 * WHAT IS STILL OWED.
 *
 * One function, and everything that needs the answer calls it: the list's "Owed to you", the
 * detail screen's "Baraka Café owes you", the default amount in the payment dialog, and the
 * decision to move an invoice to `paid`. A second implementation anywhere would eventually
 * disagree with this one about a partially-paid invoice, and the two would be right on
 * different screens.
 *
 * A REVERSAL IS A ROW, NEVER A DELETION
 * -------------------------------------
 * The application role holds no DELETE (see `0003_platform.sql`), and a payment is exactly the
 * kind of record that must survive being wrong: "we recorded R10 000 on the 3rd and took it back
 * on the 5th" is a different history from "we never recorded anything", and only one of them is
 * true. So a reversal is a row of its own that points at the payment it takes back, and the
 * arithmetic below subtracts it rather than pretending it was never there.
 *
 * Amounts are stored POSITIVE on both kinds. The direction lives in `kind`, so a stray sign
 * cannot turn a payment into a reversal or the other way around.
 */
import { subMoney, sumMoney, zero, type Money } from '$lib/core/money';
import { REVERSAL_WINDOW_DAYS, type InvoicePayment } from './types';

export type Settlement = {
	/** What has actually been received: payments, less anything reversed. */
	readonly paid: Money;
	/** What is still expected. Never negative — see `outstanding` below. */
	readonly outstanding: Money;
	/** Paid in full. What moves an invoice to `paid`. */
	readonly settled: boolean;
	/** Something has been received, but not all of it. The design's partial-payment case. */
	readonly partly: boolean;
};

/**
 * Settle an invoice against its payments.
 *
 * `total` is the invoice's own total, which for an issued invoice is the SNAPSHOT — the number
 * printed on the document the client holds, not a recomputation that could have moved.
 *
 * OVERPAYMENT clamps `outstanding` at zero rather than going negative. A client who paid R100
 * too much is owed a refund, which is a credit note and a separate document; what the screens
 * must not say is that this invoice is owed minus R100.
 */
export function settle(total: Money, payments: readonly InvoicePayment[]): Settlement {
	const reversed = new Set(
		payments.flatMap((p) => (p.reversesPaymentId ? [p.reversesPaymentId] : []))
	);

	const received = payments.filter((p) => p.kind === 'payment' && !reversed.has(p.id));
	const paid = sumMoney(
		total.currency,
		received.map((p) => p.amount)
	);

	const settled = paid.cents >= total.cents;
	const outstanding = settled ? zero(total.currency) : subMoney(total, paid);

	return { paid, outstanding, settled, partly: paid.cents > 0 && !settled };
}

/**
 * Can this payment still be taken back?
 *
 * Thirty days from when the payment was RECORDED, not from the day the money moved. The design
 * states the window as a property of the act — "Recording a payment can be undone for 30 days" —
 * and a payment entered late for an old bank date would otherwise arrive already un-undoable.
 *
 * A payment that has already been reversed cannot be reversed twice; the database enforces that
 * as well, with a unique index, because two concurrent clicks are a real thing.
 */
export function canReverse(
	payment: InvoicePayment,
	alreadyReversed: boolean,
	now: Date
): { readonly can: boolean; readonly reason: string | null } {
	if (payment.kind !== 'payment') {
		return { can: false, reason: 'That is already a reversal.' };
	}
	if (alreadyReversed) {
		return { can: false, reason: 'That payment has already been undone.' };
	}
	if (daysSince(payment.recordedAt, now) > REVERSAL_WINDOW_DAYS) {
		return {
			can: false,
			reason: `Payments can only be undone for ${REVERSAL_WINDOW_DAYS} days, and this one was recorded longer ago than that. Record a credit note instead.`
		};
	}
	return { can: true, reason: null };
}

/**
 * Whole days between two instants.
 *
 * Not money: there is no rounding policy to respect here, and the ESLint backstop that guards
 * `Math.floor` is disabled with that reason rather than routed through `roundDiv`, which would
 * be pretending a duration is an amount.
 */
export function daysSince(at: Date, now: Date): number {
	// eslint-disable-next-line no-restricted-syntax -- a duration in days, not money
	return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000));
}

/** The day the undo window closes, as a date rather than a countdown. See ESLint zone 10. */
export function reversalWindowCloses(recordedAt: Date): Date {
	return new Date(recordedAt.getTime() + REVERSAL_WINDOW_DAYS * 86_400_000);
}
