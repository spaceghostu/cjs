/**
 * INVOICING'S CORE, PROVEN.
 *
 * The pure half: what an invoice comes to, what is still owed on it, what status it is in today,
 * and every word the screens say about it. Nothing here touches a database — the guarantees that
 * need Postgres are asserted in `modules/invoicing/invoicing.test.ts`.
 *
 * The first block is the one that settles README open question 1, and it is deliberately the
 * design's own worked example to the cent.
 */
import { describe, expect, it } from 'vitest';
import { money, quantity, rate, unitPrice } from '$lib/core/money/ctor';
import { VAT_POLICY, ZAR, formatZar, type Money } from '$lib/core/money';
import type { DocumentIssuer } from '$lib/core/document';
import type { Invoice, InvoiceLine, InvoicePayment } from './types';
import { priceInvoice } from './pricing';
import { invoiceDocument, invoiceTypeLabel } from './document';
import { effectiveInvoiceStatus, isPastDue, statusAfterSettlement } from './status';
import { canReverse, settle } from './settlement';
import { detailSentence, openCountPhrase, statusCopy, summarySentence } from './copy';
import { marginPanel } from './margin';
import { matchesFilter } from './filter';
import { blockersToIssuing, blankLine, patchFromEditor, type EditorState } from './editor';

const VAT = rate(150_000);

/**
 * `formatZar` separates thousands with a NON-BREAKING space, so an expectation written with an
 * ordinary one produces the worst failure message in testing: `expected 'R21 000,00' to be
 * 'R21 000,00'`. Same helper, same reason, as `modules/quoting/quoting.test.ts`.
 */
function rands(m: Money): string {
	return formatZar(m).replaceAll('\u00a0', ' ');
}

function line(overrides: Partial<InvoiceLine> & { id: string }): InvoiceLine {
	return {
		position: 0,
		description: 'A line',
		provenance: null,
		documentDescription: null,
		qty: quantity(1_000_000),
		unitPrice: unitPrice(0, ZAR),
		taxTreatment: 'standard',
		vatRate: VAT,
		noCharge: false,
		sourceItemId: null,
		cost: null,
		costSource: null,
		...overrides
	};
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
	return {
		id: 'inv',
		status: 'sent',
		number: 'INV-1042',
		customer: {
			customerId: 'c1',
			name: 'Meridian Developments',
			contactPerson: null,
			email: 'accounts@meridian.co.za',
			phone: null,
			vatNumber: null,
			addressLine1: '9 Buitengracht Street',
			addressLine2: null,
			city: 'Cape Town',
			postalCode: null,
			country: 'ZA'
		},
		sendTo: { name: null, email: 'accounts@meridian.co.za' },
		issueDate: '2026-07-18',
		dueDate: '2026-08-18',
		pricing: { mode: 'exclusive', engine: 'za_vat', vatRate: VAT, policy: VAT_POLICY },
		lines: [],
		sourceQuoteId: null,
		sourceQuoteNumber: null,
		issuedAt: new Date('2026-07-18T09:04:00Z'),
		viewCount: 0,
		lastViewedAt: null,
		cancelledAt: null,
		cancelledReason: null,
		savedAt: new Date('2026-07-18T09:04:00Z'),
		...overrides
	};
}

/**
 * The design's invoice, as the desktop document states it. Note the shelving line: quantity 2 at
 * a UNIT price of R2 300, which is a LINE TOTAL of R4 600 — the only reading under which these
 * five numbers add up.
 */
const INV_1042 = invoice({
	lines: [
		line({
			id: 'l1',
			position: 0,
			description: 'Counter and bar top',
			unitPrice: unitPrice(16_400_000_000, ZAR)
		}),
		line({
			id: 'l2',
			position: 1,
			description: 'Shelving unit',
			qty: quantity(2_000_000),
			unitPrice: unitPrice(2_300_000_000, ZAR)
		}),
		line({
			id: 'l3',
			position: 2,
			description: 'Fitting and finishing',
			unitPrice: unitPrice(0, ZAR),
			noCharge: true
		})
	]
});

describe('INV-1042 — README open question 1', () => {
	it('reproduces the design’s invoice to the cent', () => {
		const price = priceInvoice(INV_1042);

		expect(rands(price.subtotal)).toBe('R21 000,00');
		expect(rands(price.tax)).toBe('R3 150,00');
		expect(rands(price.total)).toBe('R24 150,00');
	});

	it('makes the amount column the LINE total, not the unit price', () => {
		const price = priceInvoice(INV_1042);
		const amounts = price.priced.lines.map((l) => rands(l.amount));

		// The mobile screen renders `Shelving unit ×2 → R9 200`, which totals R28 750 against a
		// header that says R24 150. The desktop document is authoritative and this is why: only
		// R4 600 reconciles. T22 renders this number.
		expect(amounts).toEqual(['R16 400,00', 'R4 600,00', 'R0,00']);
	});

	it('keeps the no-charge line on the document rather than hiding it', () => {
		const price = priceInvoice(INV_1042);
		const document = invoiceDocument({ invoice: INV_1042, price, issuer: THORNHILL });

		// `±0.00` in the design. A client who was told something was included should be able to
		// see that on the paper they were sent.
		expect(document.lines).toHaveLength(3);
		expect(document.lines[2].amount.cents).toBe(0);
	});
});

const THORNHILL: DocumentIssuer = {
	tradingName: 'Thornhill Joinery',
	addressLines: ['14 Sir Lowry Road', 'Cape Town 8001'],
	vatNumber: '4890271563',
	phone: '021 447 2210'
};

describe('the document', () => {
	it('says TAX INVOICE only when the issuer is a VAT vendor', () => {
		// VAT Act s58(1)(a): representing tax where none is payable is a criminal offence, so the
		// heading follows the registration rather than a caller's choice.
		expect(invoiceTypeLabel(THORNHILL)).toBe('TAX INVOICE');
		expect(invoiceTypeLabel({ ...THORNHILL, vatNumber: null })).toBe('INVOICE');
	});

	it('words the totals as an invoice, not as a quote', () => {
		const document = invoiceDocument({
			invoice: INV_1042,
			price: priceInvoice(INV_1042),
			issuer: THORNHILL
		});

		expect(document.party.label).toBe('Billed to');
		expect(document.date).toEqual({ label: 'Due', value: '18 August 2026' });
		expect(document.totals.totalLabel).toBe('Amount due');
		expect(document.totals.taxLabel).toBe('VAT 15%');
	});

	it('puts banking details above the closing line', () => {
		const document = invoiceDocument({
			invoice: INV_1042,
			price: priceInvoice(INV_1042),
			issuer: THORNHILL,
			bankingDetails: ['Standard Bank · Acc 0271 553 810 · Branch 020909']
		});

		expect(document.footer).toEqual([
			'Standard Bank · Acc 0271 553 810 · Branch 020909',
			'Thank you — we appreciate your business.'
		]);
	});
});

describe('overdue is derived, never stored', () => {
	it('turns sent into overdue the day after the due date, and not before', () => {
		expect(effectiveInvoiceStatus('sent', '2026-08-18', '2026-08-17')).toBe('sent');
		// Due ON the 18th means payable all day on the 18th. Anything else makes "due 18 August"
		// mean "due before 18 August", which is not what the client read.
		expect(effectiveInvoiceStatus('sent', '2026-08-18', '2026-08-18')).toBe('sent');
		expect(effectiveInvoiceStatus('sent', '2026-08-18', '2026-08-19')).toBe('overdue');
		expect(effectiveInvoiceStatus('viewed', '2026-08-18', '2026-08-19')).toBe('overdue');
	});

	it('never makes a draft, a paid or a cancelled invoice overdue', () => {
		for (const stored of ['draft', 'paid', 'cancelled'] as const) {
			expect(effectiveInvoiceStatus(stored, '2020-01-01', '2026-08-19')).toBe(stored);
		}
	});

	it('leaves an invoice with no due date alone forever', () => {
		expect(isPastDue(null, '2099-01-01')).toBe(false);
		expect(effectiveInvoiceStatus('sent', null, '2099-01-01')).toBe('sent');
	});
});

describe('settlement', () => {
	const total = money(2_415_000, ZAR);

	function payment(overrides: Partial<InvoicePayment> & { id: string }): InvoicePayment {
		return {
			kind: 'payment',
			amount: money(2_415_000, ZAR),
			method: 'eft',
			reference: null,
			receivedOn: '2026-07-24',
			recordedAt: new Date('2026-07-24T10:00:00Z'),
			recordedByUserId: 'u1',
			reversesPaymentId: null,
			...overrides
		};
	}

	it('settles an invoice paid in full', () => {
		const result = settle(total, [payment({ id: 'p1' })]);

		expect(result.settled).toBe(true);
		expect(result.outstanding.cents).toBe(0);
		expect(rands(result.paid)).toBe('R24 150,00');
	});

	it('carries a part payment without claiming the invoice is settled', () => {
		const result = settle(total, [payment({ id: 'p1', amount: money(1_000_000, ZAR) })]);

		expect(result.settled).toBe(false);
		expect(result.partly).toBe(true);
		expect(rands(result.outstanding)).toBe('R14 150,00');
	});

	it('un-settles an invoice when a payment is reversed', () => {
		const result = settle(total, [
			payment({ id: 'p1' }),
			payment({
				id: 'r1',
				kind: 'reversal',
				reversesPaymentId: 'p1',
				recordedAt: new Date('2026-07-26T10:00:00Z')
			})
		]);

		expect(result.settled).toBe(false);
		expect(result.paid.cents).toBe(0);
		expect(rands(result.outstanding)).toBe('R24 150,00');
	});

	it('never reports a negative outstanding on an overpayment', () => {
		// The client is owed a refund, which is a credit note. What this screen must not say is
		// that the invoice is owed minus R100.
		const result = settle(total, [payment({ id: 'p1', amount: money(2_500_000, ZAR) })]);

		expect(result.outstanding.cents).toBe(0);
		expect(result.settled).toBe(true);
	});

	it('returns to viewed rather than sent when the client had opened it', () => {
		expect(statusAfterSettlement(false, 2)).toBe('viewed');
		expect(statusAfterSettlement(false, 0)).toBe('sent');
		expect(statusAfterSettlement(true, 2)).toBe('paid');
	});

	it('refuses a reversal after 30 days, and explains why', () => {
		const p = payment({ id: 'p1', recordedAt: new Date('2026-07-01T10:00:00Z') });

		expect(canReverse(p, false, new Date('2026-07-30T10:00:00Z')).can).toBe(true);
		expect(canReverse(p, false, new Date('2026-07-31T10:00:00Z')).can).toBe(true);

		const late = canReverse(p, false, new Date('2026-08-02T10:00:00Z'));
		expect(late.can).toBe(false);
		expect(late.reason).toContain('30 days');
		expect(late.reason).toContain('credit note');
	});

	it('refuses to reverse the same payment twice', () => {
		const p = payment({ id: 'p1' });
		expect(canReverse(p, true, new Date('2026-07-25T10:00:00Z')).can).toBe(false);
	});
});

describe('the words on the screen', () => {
	const today = '2026-07-29';

	it('states the status relatively and humanly, never as an enum', () => {
		expect(
			statusCopy({ status: 'sent', dueDate: '2026-08-01', paidOn: null, hasAmount: true }, today)
		).toEqual({ text: 'Due in 3 days', tone: 'sent' });

		expect(
			statusCopy({ status: 'sent', dueDate: '2026-07-29', paidOn: null, hasAmount: true }, today)
		).toEqual({ text: 'Due today', tone: 'attention' });

		expect(
			statusCopy({ status: 'sent', dueDate: '2026-07-30', paidOn: null, hasAmount: true }, today)
		).toEqual({ text: 'Due tomorrow', tone: 'attention' });

		// Far from the due date, whether they have read it is the interesting fact.
		expect(
			statusCopy({ status: 'viewed', dueDate: '2026-09-01', paidOn: null, hasAmount: true }, today)
		).toEqual({ text: 'Viewed by client', tone: 'sent' });

		expect(
			statusCopy(
				{ status: 'paid', dueDate: '2026-08-01', paidOn: '2026-07-24', hasAmount: true },
				today
			)
		).toEqual({ text: 'Paid 24 Jul', tone: 'settled' });

		expect(
			statusCopy({ status: 'overdue', dueDate: '2026-07-26', paidOn: null, hasAmount: true }, today)
		).toEqual({ text: 'Overdue by 3 days', tone: 'wrong' });
	});

	it('tells a draft what it still needs', () => {
		expect(
			statusCopy({ status: 'draft', dueDate: null, paidOn: null, hasAmount: false }, today)
		).toEqual({ text: 'Draft · needs an amount', tone: 'draft' });

		expect(
			statusCopy({ status: 'draft', dueDate: null, paidOn: null, hasAmount: true }, today).text
		).toBe('Draft');
	});

	it('never colours an ordinary Tuesday', () => {
		// A sent invoice inside its terms is the normal life of an invoice. Only lateness earns
		// `wrong`, and only the last two days earn `attention`.
		const tone = statusCopy(
			{ status: 'sent', dueDate: '2026-08-20', paidOn: null, hasAmount: true },
			today
		).tone;
		expect(tone).toBe('sent');
	});

	it('writes the screen’s summary as a sentence somebody would say', () => {
		expect(
			summarySentence(
				{ unpaidCount: 6, overdueCount: 0, nextDue: { on: '2026-08-03', count: 1 } },
				today
			)
		).toBe('6 unpaid, none overdue. One is due on Monday.');
	});

	it('handles the states the design does not draw', () => {
		expect(summarySentence({ unpaidCount: 0, overdueCount: 0, nextDue: null }, today)).toBe(
			'Nothing unpaid. Everything you have sent has been settled.'
		);

		expect(
			summarySentence(
				{ unpaidCount: 1, overdueCount: 2, nextDue: { on: '2026-07-29', count: 2 } },
				today
			)
		).toBe('1 unpaid, two overdue. Two are due today.');

		// Beyond the week a weekday name stops helping, so the date itself is used.
		expect(
			summarySentence(
				{ unpaidCount: 3, overdueCount: 0, nextDue: { on: '2026-08-20', count: 1 } },
				today
			)
		).toBe('3 unpaid, none overdue. One is due on 20 Aug.');

		// Already late: the overdue count has said so, and saying it twice is nagging.
		expect(
			summarySentence(
				{ unpaidCount: 2, overdueCount: 1, nextDue: { on: '2026-07-01', count: 1 } },
				today
			)
		).toBe('2 unpaid, one overdue.');
	});

	it('writes the detail screen’s second line', () => {
		expect(
			detailSentence({
				issueDate: '2026-07-18',
				dueDate: '2026-08-01',
				viewCount: 2,
				today: '2026-07-29'
			})
		).toBe('Sent 18 Jul. Due Saturday, 1 August. They opened it twice.');

		// Nothing opened, nothing said about opens.
		expect(detailSentence({ issueDate: '2026-07-18', dueDate: null, viewCount: 0, today })).toBe(
			'Sent 18 Jul.'
		);
	});

	it('counts opens in words', () => {
		expect(openCountPhrase(1)).toBe('Once');
		expect(openCountPhrase(2)).toBe('Twice');
		expect(openCountPhrase(5)).toBe('Five times');
		expect(openCountPhrase(14)).toBe('14 times');
	});
});

describe('the filter tabs', () => {
	it('counts an overdue invoice as unpaid', () => {
		// The design says "6 unpaid, none overdue"; an owner reading that would be badly served by
		// a tab that quietly dropped late invoices out of the six.
		expect(matchesFilter('unpaid', 'overdue')).toBe(true);
		expect(matchesFilter('unpaid', 'sent')).toBe(true);
		expect(matchesFilter('unpaid', 'viewed')).toBe(true);
		expect(matchesFilter('unpaid', 'paid')).toBe(false);
		expect(matchesFilter('unpaid', 'draft')).toBe(false);
	});

	it('shows a cancelled invoice under All and nowhere else', () => {
		expect(matchesFilter('all', 'cancelled')).toBe(true);
		for (const f of ['unpaid', 'overdue', 'paid', 'drafts'] as const) {
			expect(matchesFilter(f, 'cancelled')).toBe(false);
		}
	});
});

describe('the margin panel', () => {
	const revenue = money(2_100_000, ZAR);

	it('makes what you keep the revenue less the costs, always', () => {
		const panel = marginPanel({
			revenue,
			costs: [
				{ kind: 'materials', amount: money(1_428_000, ZAR) },
				{ kind: 'labour', amount: money(57_000, ZAR) }
			],
			totalLines: 3,
			costedLines: 3,
			inventoryOwned: true
		});

		expect(panel.known).toBe(true);
		if (!panel.known) return;

		// 21 000 − 14 280 − 570 = 6 150. The design's three figures cannot all be true at once
		// (see the file header); this is the reading under which the column adds up.
		expect(rands(panel.margin.keep)).toBe('R6 150,00');
		expect(panel.margin.costs.map((c) => c.label)).toEqual(['Materials', 'Labour']);
		expect(panel.margin.caveat).toBeNull();
	});

	it('says so when only some lines have a cost', () => {
		const panel = marginPanel({
			revenue,
			costs: [{ kind: 'materials', amount: money(1_428_000, ZAR) }],
			totalLines: 3,
			costedLines: 1,
			inventoryOwned: true
		});

		expect(panel.known).toBe(true);
		if (!panel.known) return;
		expect(panel.margin.caveat).toBe(
			'2 of 3 lines have no cost recorded, so what you keep is at most this.'
		);
	});

	it('degrades honestly rather than guessing when nothing is known', () => {
		const panel = marginPanel({
			revenue,
			costs: [],
			totalLines: 3,
			costedLines: 0,
			inventoryOwned: false
		});

		expect(panel.known).toBe(false);
		if (panel.known) return;
		expect(panel.unavailable.offerInventory).toBe(true);
		expect(panel.unavailable.reason).toContain('Inventory');
	});

	it('does not offer Inventory to a business that already has it', () => {
		const panel = marginPanel({
			revenue,
			costs: [],
			totalLines: 3,
			costedLines: 0,
			inventoryOwned: true
		});

		expect(panel.known).toBe(false);
		if (panel.known) return;
		expect(panel.unavailable.offerInventory).toBe(false);
		expect(panel.unavailable.reason).not.toContain('Inventory');
	});

	it('omits a cost row with nothing in it rather than showing R0', () => {
		const panel = marginPanel({
			revenue,
			costs: [{ kind: 'materials', amount: money(1_000_000, ZAR) }],
			totalLines: 1,
			costedLines: 1,
			inventoryOwned: true
		});

		expect(panel.known).toBe(true);
		if (!panel.known) return;
		expect(panel.margin.costs).toHaveLength(1);
		expect(panel.margin.costs[0].kind).toBe('materials');
	});
});

describe('the editor', () => {
	function state(overrides: Partial<EditorState> = {}): EditorState {
		return {
			customerId: 'c1',
			name: 'Meridian Developments',
			contactPerson: '',
			email: '',
			phone: '',
			vatNumber: '',
			addressLine1: '',
			addressLine2: '',
			city: '',
			postalCode: '',
			sendToName: '',
			sendToEmail: 'accounts@meridian.co.za',
			dueDate: '2026-08-18',
			lines: [{ ...blankLine('l1'), description: 'Counter and bar top', unitPrice: '16 400' }],
			...overrides
		};
	}

	it('names everything that is missing at once', () => {
		const blockers = blockersToIssuing(
			state({ customerId: null, sendToEmail: '', dueDate: '', lines: [] })
		);

		expect(blockers).toHaveLength(4);
		expect(blockers.join(' ')).toContain('client');
		expect(blockers.join(' ')).toContain('email');
		expect(blockers.join(' ')).toContain('due date');
		expect(blockers.join(' ')).toContain('at least one line');
	});

	it('blocks an unpriced line but not a deliberate no-charge one', () => {
		const unpriced = blockersToIssuing(
			state({ lines: [{ ...blankLine('l1'), description: 'Fitting and finishing' }] })
		);
		expect(unpriced).toHaveLength(1);
		expect(unpriced[0]).toContain('Mark it as included');

		const included = blockersToIssuing(
			state({
				lines: [{ ...blankLine('l1'), description: 'Fitting and finishing', noCharge: true }]
			})
		);
		expect(included).toHaveLength(0);
	});

	it('sends a no-charge line at zero whatever is in the price field', () => {
		const patch = patchFromEditor(
			state({
				lines: [{ ...blankLine('l1'), description: 'Fitting', unitPrice: '9 999', noCharge: true }]
			})
		);

		expect(patch.lines[0].unitPriceMicros).toBe(0);
		expect(patch.lines[0].noCharge).toBe(true);
	});

	it('does not send the empty row somebody just added', () => {
		const patch = patchFromEditor(state({ lines: [blankLine('l1')] }));
		expect(patch.lines).toHaveLength(0);
	});
});
