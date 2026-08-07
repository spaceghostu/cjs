/**
 * THE CLIENT-SAFE HALF, under test without a database.
 *
 * Calendar arithmetic, the pricing adapter and the projection onto paper. All three run in the
 * browser on every keystroke of the editor, so all three are pure — and a pure unit is the
 * only kind you can ask about the awkward cases: the last day of validity, a leap year, a
 * business that is not a VAT vendor, a draft with no client yet.
 */
import { describe, expect, it } from 'vitest';
import { money, percent, quantity, unitPrice } from '$lib/core/money/ctor';
import { formatZar, ZAR, type Money } from '$lib/core/money';
import {
	DEFAULT_QUOTE_FOOTER,
	addDays,
	daysBetween,
	documentTaxLabel,
	effectiveStatus,
	formatDocumentDate,
	formatShortDate,
	hasExpired,
	isCalendarDate,
	issuerFrom,
	priceQuote,
	quoteDocument,
	todayIn,
	type Quote,
	type QuoteLine
} from './index';

function rands(m: Money): string {
	return formatZar(m).replaceAll('\u00a0', ' ');
}

function line(over: Partial<QuoteLine> & { description: string; rands: number }): QuoteLine {
	return {
		id: over.id ?? `line-${over.description}`,
		position: 0,
		provenance: null,
		documentDescription: null,
		qty: quantity(1_000_000),
		unitPrice: unitPrice(over.rands * 1_000_000, ZAR),
		taxTreatment: 'standard',
		vatRate: percent(15),
		sourceItemId: null,
		...over
	};
}

function quote(over: Partial<Quote> = {}): Quote {
	return {
		id: 'q1',
		status: 'draft',
		number: null,
		customer: {
			customerId: 'c1',
			name: 'Fynbos Interiors',
			contactPerson: 'Renske Malan',
			email: 'renske@fynbosinteriors.co.za',
			phone: null,
			vatNumber: null,
			addressLine1: null,
			addressLine2: null,
			city: null,
			postalCode: null,
			country: 'ZA'
		},
		sendTo: { name: 'Renske Malan', email: 'renske@fynbosinteriors.co.za' },
		validUntil: '2026-08-22',
		deposit: { kind: 'rate', rate: percent(50) },
		pricing: { mode: 'exclusive', engine: 'za_vat', vatRate: percent(15), policy: 'v1' },
		lines: [],
		savedAt: new Date('2026-08-04T19:47:00Z'),
		sentAt: null,
		...over
	};
}

const WORKED_EXAMPLE = [
	line({ description: 'Solid oak kitchen island top', rands: 24_800, position: 0 }),
	line({ description: 'Base cabinetry, oak veneer', rands: 8_600, position: 1 }),
	line({ description: 'Installation and finishing', rands: 9_000, position: 2 })
];

describe('priceQuote', () => {
	it('reproduces the design worked example', () => {
		const price = priceQuote(quote({ lines: WORKED_EXAMPLE }));

		expect(rands(price.subtotal)).toBe('R42 400,00');
		expect(rands(price.tax)).toBe('R6 360,00');
		expect(rands(price.total)).toBe('R48 760,00');
		expect(rands(price.deposit!)).toBe('R24 380,00');
	});

	it('has no deposit line when the business asks for none', () => {
		// Null, not zero. A document with no deposit terms prints no deposit line — "R0,00 on
		// acceptance" is a sentence nobody meant to write.
		const price = priceQuote(quote({ lines: WORKED_EXAMPLE, deposit: { kind: 'none' } }));
		expect(price.deposit).toBeNull();
	});

	it('takes the deposit off the total, not the subtotal', () => {
		// "50% to start" is half of what the client pays, and what they pay includes VAT. Any
		// other reading makes the two halves of a 50/50 split unequal.
		const price = priceQuote(quote({ lines: WORKED_EXAMPLE }));
		expect(price.deposit!.cents * 2).toBe(price.total.cents);
	});

	it('charges no VAT for a business that is not a vendor', () => {
		const price = priceQuote(
			quote({
				lines: WORKED_EXAMPLE,
				pricing: { mode: 'exclusive', engine: 'none', vatRate: percent(15), policy: 'v1' }
			})
		);

		expect(price.tax).toEqual(money(0, ZAR));
		expect(price.total).toEqual(price.subtotal);
	});

	it('prices an empty quote as zero rather than throwing', () => {
		// The state a quote is in for the first ten seconds of its life. The preview renders it.
		const price = priceQuote(quote());
		expect(price.total).toEqual(money(0, ZAR));
	});
});

describe('calendar dates', () => {
	it('accepts a real day and refuses one that never happened', () => {
		expect(isCalendarDate('2026-08-22')).toBe(true);
		expect(isCalendarDate('2026-02-29')).toBe(false); // 2026 is not a leap year
		expect(isCalendarDate('2024-02-29')).toBe(true);
		expect(isCalendarDate('2026-13-01')).toBe(false);
		expect(isCalendarDate('22-08-2026')).toBe(false);
		expect(isCalendarDate(20260822)).toBe(false);
	});

	it('adds days across month, year and leap boundaries', () => {
		expect(addDays('2026-08-04', 14)).toBe('2026-08-18');
		expect(addDays('2026-08-22', 14)).toBe('2026-09-05');
		expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addDays('2026-08-04', -4)).toBe('2026-07-31');
	});

	it('counts the days between two of them', () => {
		expect(daysBetween('2026-08-04', '2026-08-22')).toBe(18);
		expect(daysBetween('2026-08-22', '2026-08-04')).toBe(-18);
		expect(daysBetween('2026-08-04', '2026-08-04')).toBe(0);
	});

	it("reads the day in the business's zone, not the host's", () => {
		// 23:30 UTC on the 4th is already 01:30 on the 5th in Johannesburg. A server on UTC
		// would date the quote a day early, and the client has the printed date.
		expect(todayIn(new Date('2026-08-04T23:30:00Z'))).toBe('2026-08-05');
		expect(todayIn(new Date('2026-08-04T21:00:00Z'))).toBe('2026-08-04');
	});
});

describe('expiry', () => {
	it('lasts all of the day it names', () => {
		// "Valid until the 22nd" means acceptable on the 22nd. Anything else makes it mean
		// "valid before", which is not what the client read.
		expect(hasExpired('2026-08-22', '2026-08-22')).toBe(false);
		expect(hasExpired('2026-08-22', '2026-08-23')).toBe(true);
		expect(hasExpired('2026-08-22', '2026-08-21')).toBe(false);
	});

	it('never expires a quote with no date on it', () => {
		expect(hasExpired(null, '2030-01-01')).toBe(false);
	});

	it('expires only what is still waiting on an answer', () => {
		expect(effectiveStatus('sent', '2026-08-22', '2026-08-23')).toBe('expired');
		expect(effectiveStatus('viewed', '2026-08-22', '2026-08-23')).toBe('expired');
		// An answered quote keeps its answer. Accepting on the last day and reading the record
		// a week later must not turn the acceptance into an expiry.
		expect(effectiveStatus('accepted', '2026-08-22', '2026-08-30')).toBe('accepted');
		expect(effectiveStatus('declined', '2026-08-22', '2026-08-30')).toBe('declined');
		expect(effectiveStatus('draft', '2026-08-22', '2026-08-30')).toBe('draft');
	});
});

describe('date formatting', () => {
	it('does not depend on host ICU data', () => {
		// Byte-stable PDFs are an acceptance criterion. A month name from `Intl` varies by
		// platform and Node build; these do not.
		expect(formatDocumentDate('2026-08-22')).toBe('22 August 2026');
		expect(formatDocumentDate('2026-01-01')).toBe('1 January 2026');
		expect(formatShortDate('2026-08-22')).toBe('22 Aug');
	});
});

describe('the document projection', () => {
	const issuer = issuerFrom({
		tradingName: 'Thornhill Joinery',
		addressLine1: '14 Sir Lowry Road',
		addressLine2: null,
		city: 'Cape Town',
		postalCode: '8001',
		vatNumber: '4890271563',
		phone: '021 447 2210'
	});

	it('assembles the masthead without leaving gaps for missing parts', () => {
		expect(issuer.addressLines).toEqual(['14 Sir Lowry Road', 'Cape Town 8001']);

		const sparse = issuerFrom({
			tradingName: 'Kloof Cabinetry',
			addressLine1: null,
			addressLine2: null,
			city: null,
			postalCode: null,
			vatNumber: null,
			phone: null
		});
		expect(sparse.addressLines).toEqual([]);
	});

	it('says QUOTE, prepared for, valid until', () => {
		const q = quote({ lines: WORKED_EXAMPLE, number: 'QT-1043' });
		const doc = quoteDocument({ quote: q, price: priceQuote(q), issuer });

		expect(doc.typeLabel).toBe('QUOTE');
		expect(doc.number).toBe('QT-1043');
		expect(doc.party.label).toBe('Prepared for');
		expect(doc.party.name).toBe('Fynbos Interiors');
		expect(doc.party.detail).toBe('Renske Malan');
		expect(doc.date).toEqual({ label: 'Valid until', value: '22 August 2026' });
		expect(doc.totals.totalLabel).toBe('Total');
		expect(doc.footer).toEqual(DEFAULT_QUOTE_FOOTER);
	});

	it('prints the fuller description when the line has one', () => {
		const q = quote({
			lines: [
				line({
					description: 'Solid oak kitchen island top, 2400 × 900',
					documentDescription:
						'Solid oak kitchen island top, 2400 × 900, 40mm European oak, oiled finish',
					rands: 24_800
				})
			]
		});
		const doc = quoteDocument({ quote: q, price: priceQuote(q), issuer });

		expect(doc.lines[0].description).toContain('oiled finish');
	});

	it("falls back to the editor's description when it does not", () => {
		const q = quote({ lines: [line({ description: 'Installation and finishing', rands: 9_000 })] });
		const doc = quoteDocument({ quote: q, price: priceQuote(q), issuer });

		expect(doc.lines[0].description).toBe('Installation and finishing');
	});

	it('renders a draft with no client chosen yet', () => {
		const q = quote({ customer: { ...quote().customer, name: null }, validUntil: null });
		const doc = quoteDocument({
			quote: q,
			price: priceQuote(q),
			issuer,
			provisionalNumber: 'QT-1043'
		});

		expect(doc.party.name).toBe('No client chosen yet');
		expect(doc.number).toBe('QT-1043');
		expect(doc.date).toBeNull();
	});

	it('labels the tax with the rate that was actually charged', () => {
		const q = quote({ lines: WORKED_EXAMPLE });
		expect(documentTaxLabel(priceQuote(q).priced)).toBe('VAT 15%');

		const noVat = quote({
			lines: WORKED_EXAMPLE,
			pricing: { mode: 'exclusive', engine: 'none', vatRate: percent(15), policy: 'v1' }
		});
		// No rate was charged, so no rate is printed. s58(1)(a) — representing tax where none
		// is payable is a criminal offence, and it must not depend on a template branching.
		expect(documentTaxLabel(priceQuote(noVat).priced)).toBe('VAT');
	});
});
