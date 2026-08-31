/**
 * INVOICING'S STORY FIXTURES — shared by `InvoiceList.stories.svelte` and
 * `InvoiceDetail.stories.svelte`, extracted so each story file stays a story file.
 *
 * The shapes are ported from `invoicing.mobile.spec.ts` — the design's INV-1042, Baraka Café,
 * R24 150 — with one deliberate difference: the spec may use `$lib/core/money/ctor` because
 * `*.spec.ts` is exempt from ESLint zone 5; a story file is not, so every branded value here
 * comes through the four parse doors the barrel exports. `today` is pinned to the spec's
 * 2026-07-29 so due-date colouring is deterministic in a screenshot.
 */
import {
	marginPanel,
	type Invoice,
	type InvoiceEvent,
	type InvoiceFilter,
	type InvoiceListItem,
	type MarginPanel,
	type PaymentMethod,
	type StatusFacts,
	type SummaryFacts
} from '$lib/core/invoicing';
import {
	VAT_POLICY,
	parseMoneyInput,
	parseQuantityInput,
	parseRateInput,
	parseUnitPriceInput,
	type Money,
	type Quantity,
	type Rate,
	type UnitPrice
} from '$lib/core/money';
import type { CalendarDate } from '$lib/core/calendar';
import type { DocumentIssuer, PrintableDocument } from '$lib/core/document';

/** The spec's reference day. Every relative badge below is relative to this. */
export const TODAY: CalendarDate = '2026-07-29';

/*
 * Money through the only doors a non-test file has. Each unwrap throws on a bad literal,
 * which in a fixtures file is exactly right — a typo here should fail the suite loudly.
 */
function money(input: string): Money {
	const parsed = parseMoneyInput(input);
	if (!parsed.ok) throw new Error(parsed.message);
	return parsed.value;
}

function qty(input: string): Quantity {
	const parsed = parseQuantityInput(input);
	if (!parsed.ok) throw new Error(parsed.message);
	return parsed.value;
}

function unitPrice(input: string): UnitPrice {
	const parsed = parseUnitPriceInput(input);
	if (!parsed.ok) throw new Error(parsed.message);
	return parsed.value;
}

function vatRate(input: string): Rate {
	const parsed = parseRateInput(input);
	if (!parsed.ok) throw new Error(parsed.message);
	return parsed.value;
}

function listItem(overrides: Partial<InvoiceListItem> & { id: string }): InvoiceListItem {
	return {
		number: 'INV-1042',
		status: 'sent',
		customerName: 'Baraka Café',
		issueDate: '2026-07-18',
		dueDate: '2026-08-01',
		paidOn: null,
		total: money('24150.00'),
		outstanding: money('24150.00'),
		hasAmount: true,
		updatedAt: new Date('2026-07-18T09:04:00Z'),
		...overrides
	};
}

/**
 * The status matrix, one row each: the states `statusCopy` distinguishes, including the
 * due-soon window (2026-08-01 is 3 days from TODAY, inside `DUE_SOON_DAYS`).
 */
export const INVOICE_ROWS: readonly InvoiceListItem[] = [
	listItem({ id: 'due-soon', number: 'INV-1042' }),
	listItem({
		id: 'sent-far',
		number: 'INV-1043',
		customerName: 'Fynbos Interiors',
		dueDate: '2026-08-28',
		total: money('8400.00'),
		outstanding: money('8400.00')
	}),
	listItem({
		id: 'viewed',
		number: 'INV-1041',
		status: 'viewed',
		customerName: 'Kloof Street Deli',
		dueDate: '2026-08-15',
		total: money('12750.00'),
		outstanding: money('12750.00')
	}),
	listItem({
		id: 'overdue',
		number: 'INV-1038',
		status: 'overdue',
		customerName: 'Sea Point Guesthouse',
		issueDate: '2026-06-30',
		dueDate: '2026-07-14',
		total: money('5175.00'),
		outstanding: money('5175.00')
	}),
	listItem({
		id: 'paid',
		number: 'INV-1039',
		status: 'paid',
		customerName: 'Woodstock Exchange',
		paidOn: '2026-07-24',
		outstanding: money('0.00'),
		total: money('18400.00')
	}),
	listItem({
		id: 'cancelled',
		number: 'INV-1037',
		status: 'cancelled',
		customerName: 'Bo-Kaap Books',
		total: money('2300.00'),
		outstanding: money('0.00')
	}),
	listItem({
		id: 'draft-priced',
		number: null,
		status: 'draft',
		customerName: 'Salt River Studios',
		issueDate: null,
		dueDate: null,
		total: null,
		outstanding: null,
		hasAmount: true
	}),
	listItem({
		id: 'draft-empty',
		number: null,
		status: 'draft',
		customerName: null,
		issueDate: null,
		dueDate: null,
		total: null,
		outstanding: null,
		hasAmount: false
	})
];

export const COUNTS: Readonly<Record<InvoiceFilter, number>> = {
	all: 8,
	unpaid: 4,
	overdue: 1,
	paid: 1,
	drafts: 2
};

export const SUMMARY: SummaryFacts = {
	unpaidCount: 4,
	overdueCount: 1,
	nextDue: { on: '2026-08-01', count: 1 }
};

export const LIST_TOTALS = {
	owed: money('50475.00'),
	dueThisWeek: money('24150.00'),
	overdue: money('5175.00')
} as const;

/** The design's INV-1042, as paper. The shelving line is qty 2 at a LINE TOTAL of R4 600. */
export const INV_1042: PrintableDocument = {
	kind: 'invoice',
	typeLabel: 'TAX INVOICE',
	number: 'INV-1042',
	issuer: {
		tradingName: 'Thornhill Joinery',
		addressLines: ['14 Sir Lowry Road'],
		vatNumber: '4890271563',
		phone: '021 447 2210'
	},
	party: { label: 'Billed to', name: 'Baraka Café', detail: null },
	date: { label: 'Due', value: '1 August 2026' },
	lines: [
		{
			id: 'l1',
			description: 'Counter and bar top',
			qty: qty('1'),
			amount: money('16400.00')
		},
		{
			id: 'l2',
			description: 'Shelving unit ×2',
			qty: qty('2'),
			amount: money('4600.00')
		},
		{
			id: 'l3',
			description: 'Fitting and finishing',
			qty: qty('1'),
			amount: money('0.00')
		}
	],
	totals: {
		subtotalLabel: 'Before VAT',
		subtotal: money('21000.00'),
		taxLabel: 'VAT 15%',
		tax: money('3150.00'),
		totalLabel: 'Amount due',
		total: money('24150.00')
	},
	footer: ['Thank you — we appreciate your business.'],
	pageLabel: 'Page 1 of 1'
};

export const EVENTS: readonly InvoiceEvent[] = [
	{
		id: 'e1',
		kind: 'emailed',
		actor: 'business',
		actorUserId: 'u1',
		detail: 'accounts@barakacafe.co.za',
		occurredAt: new Date('2026-07-18T09:12:00Z')
	},
	{
		id: 'e2',
		kind: 'opened',
		actor: 'client',
		actorUserId: null,
		detail: null,
		occurredAt: new Date('2026-07-26T08:41:00Z')
	}
];

export const MEMBER_NAMES: Readonly<Record<string, string>> = { u1: 'Alice' };

/** `PaymentRow` is IssuedInvoice's own local type; these literals match it structurally. */
export type PaymentFixture = {
	id: string;
	kind: 'payment' | 'reversal';
	amount: Money;
	method: PaymentMethod;
	reference: string | null;
	receivedOn: CalendarDate;
	recordedAt: Date;
	reversible: boolean;
};

export const PART_PAYMENT: readonly PaymentFixture[] = [
	{
		id: 'p1',
		kind: 'payment',
		amount: money('10000.00'),
		method: 'eft',
		reference: 'BARAKA-JUL',
		receivedOn: '2026-07-25',
		recordedAt: new Date('2026-07-25T14:03:00Z'),
		reversible: true
	}
];

export const SETTLING_PAYMENTS: readonly PaymentFixture[] = [
	...PART_PAYMENT,
	{
		id: 'p2',
		kind: 'payment',
		amount: money('14150.00'),
		method: 'eft',
		reference: null,
		receivedOn: '2026-07-28',
		recordedAt: new Date('2026-07-28T09:40:00Z'),
		reversible: true
	}
];

/*
 * The margin panel's two faces, built by the same `marginPanel` the server calls so the
 * caveat sentences are production copy, never an imitation.
 */
export const MARGIN_KNOWN: MarginPanel = marginPanel({
	revenue: money('21000.00'),
	costs: [
		{ kind: 'materials', amount: money('7830.00') },
		{ kind: 'labour', amount: money('4500.00') }
	],
	totalLines: 3,
	costedLines: 2,
	inventoryOwned: true
});

export const MARGIN_UNKNOWN: MarginPanel = marginPanel({
	revenue: money('21000.00'),
	costs: [],
	totalLines: 3,
	costedLines: 0,
	inventoryOwned: false
});

/** The badge matrix — every branch of `statusCopy`, labelled for the story note. */
export const STATUS_FACTS: readonly { label: string; facts: StatusFacts }[] = [
	{
		label: 'Draft, priced',
		facts: { status: 'draft', dueDate: null, paidOn: null, hasAmount: true }
	},
	{
		label: 'Draft, nothing priced',
		facts: { status: 'draft', dueDate: null, paidOn: null, hasAmount: false }
	},
	{
		label: 'Sent, due far off',
		facts: { status: 'sent', dueDate: '2026-08-28', paidOn: null, hasAmount: true }
	},
	{
		label: 'Sent, due soon',
		facts: { status: 'sent', dueDate: '2026-08-01', paidOn: null, hasAmount: true }
	},
	{
		label: 'Viewed',
		facts: { status: 'viewed', dueDate: '2026-08-15', paidOn: null, hasAmount: true }
	},
	{
		label: 'Overdue',
		facts: { status: 'overdue', dueDate: '2026-07-14', paidOn: null, hasAmount: true }
	},
	{
		label: 'Paid',
		facts: { status: 'paid', dueDate: '2026-08-01', paidOn: '2026-07-24', hasAmount: true }
	},
	{
		label: 'Cancelled',
		facts: { status: 'cancelled', dueDate: null, paidOn: null, hasAmount: true }
	}
];

/** One whole draft `Invoice`, for the editor — the same job, before it is issued. */
export const DRAFT_INVOICE: Invoice = {
	id: 'inv-draft',
	status: 'draft',
	number: null,
	customer: {
		customerId: 'c1',
		name: 'Baraka Café',
		contactPerson: null,
		email: 'accounts@barakacafe.co.za',
		phone: null,
		vatNumber: null,
		addressLine1: null,
		addressLine2: null,
		city: 'Cape Town',
		postalCode: null,
		country: 'ZA'
	},
	sendTo: { name: null, email: 'accounts@barakacafe.co.za' },
	issueDate: null,
	dueDate: '2026-08-12',
	pricing: { mode: 'exclusive', engine: 'za_vat', vatRate: vatRate('15'), policy: VAT_POLICY },
	lines: [
		{
			id: 'dl1',
			position: 1,
			description: 'Counter and bar top',
			provenance: null,
			documentDescription: null,
			qty: qty('1'),
			unitPrice: unitPrice('16400.00'),
			taxTreatment: 'standard',
			vatRate: vatRate('15'),
			noCharge: false,
			sourceItemId: null,
			cost: null,
			costSource: null
		},
		{
			id: 'dl2',
			position: 2,
			description: 'Shelving unit ×2',
			provenance: 'From Inventory · European oak, 40mm',
			documentDescription: null,
			qty: qty('2'),
			unitPrice: unitPrice('2300.00'),
			taxTreatment: 'standard',
			vatRate: vatRate('15'),
			noCharge: false,
			sourceItemId: 'stock-oak-40',
			cost: unitPrice('1830.00'),
			costSource: 'inventory'
		},
		{
			id: 'dl3',
			position: 3,
			description: 'Fitting and finishing',
			provenance: null,
			documentDescription: null,
			qty: qty('1'),
			unitPrice: unitPrice('0.00'),
			taxTreatment: 'standard',
			vatRate: vatRate('15'),
			noCharge: true,
			sourceItemId: null,
			cost: null,
			costSource: null
		}
	],
	sourceQuoteId: null,
	sourceQuoteNumber: null,
	issuedAt: null,
	viewCount: 0,
	lastViewedAt: null,
	cancelledAt: null,
	cancelledReason: null,
	savedAt: new Date('2026-07-28T16:20:00Z')
};

export const ISSUER: DocumentIssuer = {
	tradingName: 'Thornhill Joinery',
	addressLines: ['14 Sir Lowry Road'],
	vatNumber: '4890271563',
	phone: '021 447 2210'
};

export const CUSTOMERS: readonly { id: string; name: string }[] = [
	{ id: 'c1', name: 'Baraka Café' },
	{ id: 'c2', name: 'Fynbos Interiors' },
	{ id: 'c3', name: 'Kloof Street Deli' }
];

export const BANKING_DETAILS: readonly string[] = [
	'First National Bank',
	'Thornhill Joinery (Pty) Ltd',
	'Account 6274 8815 902'
];

export const DOCUMENT_FOOTER: readonly string[] = ['Thank you — we appreciate your business.'];
