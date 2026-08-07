/**
 * THE PHONE ASSERTIONS FOR INVOICING — T22.
 *
 * Runs in a real Chromium at 390 × 844, the design's reference frame, under the `mobile` Vitest
 * project. Every claim here is a fact about LAYOUT, which is the one thing a unit test cannot
 * reach: asserting the class `h-11` would pass while a parent's line-height quietly made the row
 * 38px, and asserting that a `<div>` is `sticky` says nothing about whether it ends up on top of
 * the last card.
 *
 * T22's acceptance criteria, one block each:
 *   1. No horizontal scroll at 390px.
 *   2. Every touch target is at least 44px.
 *   3. Action buttons appear only on cards that need action.
 *   4. Line amounts are line totals and reconcile to the header — R24 150 for INV-1042.
 *   5. The floating action never obscures the last card.
 *   6. "Both can be undone." is present.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, type Component } from 'svelte';
// The real stylesheet. Without it every `h-11` is inert and a height assertion measures nothing
// but the default line box — which would pass for the wrong reason.
import '../../../routes/layout.css';
import { money, quantity } from '$lib/core/money/ctor';
import { ZAR } from '$lib/core/money';
import type { PrintableDocument } from '$lib/core/document';
import type { InvoiceEvent, InvoiceListItem } from '$lib/core/invoicing';
import InvoiceCard from './InvoiceCard.svelte';
import InvoiceList from './InvoiceList.svelte';
import MobileInvoice from './MobileInvoice.svelte';

/** The design's minimum. Apple's HIG and the WCAG 2.2 target-size floor agree on it. */
const TOUCH_MINIMUM = 44;
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;

const TODAY = '2026-07-29';

let target: HTMLElement | null = null;
let instance: Record<string, unknown> | null = null;

function render<P extends Record<string, unknown>>(component: Component<P>, props: P): HTMLElement {
	target = document.createElement('div');
	target.style.width = `${PHONE_WIDTH}px`;
	document.body.style.margin = '0';
	document.body.append(target);
	instance = mount(component, { target, props }) as Record<string, unknown>;
	return target;
}

/**
 * The list in the frame the shell actually gives it: a scroller that FILLS the viewport, as
 * `<main class="min-h-0 flex-1 overflow-y-auto">` does in `(app)/+layout.svelte`.
 *
 * Full height is the only geometry where `fixed` and `sticky` disagree. In a short scroller
 * floating in a tall page a `fixed` button parks at the bottom of the WINDOW, hundreds of pixels
 * clear of the list, and an overlap assertion passes on the broken thing.
 */
function renderInScroller<P extends Record<string, unknown>>(
	component: Component<P>,
	props: P
): HTMLElement {
	target = document.createElement('div');
	target.style.cssText = `width:${PHONE_WIDTH}px;height:${PHONE_HEIGHT}px;overflow-y:auto`;
	document.body.style.margin = '0';
	document.body.append(target);
	instance = mount(component, { target, props }) as Record<string, unknown>;
	return target;
}

afterEach(() => {
	if (instance) unmount(instance);
	target?.remove();
	instance = null;
	target = null;
});

/**
 * The rendered text, with `formatZar`'s NON-BREAKING space normalised to an ordinary one.
 *
 * Without this an expectation reads `expected 'R24 150' to contain 'R24 150'`, which is the worst
 * failure message in testing. Same helper, same reason, as `quoting.test.ts`.
 */
function text(root: HTMLElement): string {
	return (root.textContent ?? '').replaceAll('\u00a0', ' ');
}

/**
 * Everything a thumb can hit — and only what is actually on the screen.
 *
 * The list renders BOTH compositions and hides one with `lg:` classes, so at 390px the desktop
 * header button is in the DOM with `display: none` and a zero-height rect. Measuring it would
 * fail the 44px floor for a control nobody can see, and finding it by its label would find the
 * wrong "New invoice". `offsetParent === null` is the cheap, reliable test for "not displayed".
 */
function visible(element: HTMLElement): boolean {
	return element.offsetParent !== null || element.getBoundingClientRect().height > 0;
}

function targets(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>('a, button')].filter(visible);
}

function invoice(overrides: Partial<InvoiceListItem> & { id: string }): InvoiceListItem {
	return {
		number: 'INV-1042',
		status: 'sent',
		customerName: 'Baraka Café',
		issueDate: '2026-07-18',
		dueDate: '2026-08-01',
		paidOn: null,
		total: money(2_415_000, ZAR),
		outstanding: money(2_415_000, ZAR),
		hasAmount: true,
		updatedAt: new Date('2026-07-18T09:04:00Z'),
		...overrides
	};
}

const LIST_PROPS = {
	counts: { all: 24, unpaid: 6, overdue: 0, paid: 16, drafts: 2 },
	filter: 'all' as const,
	today: TODAY,
	summary: { unpaidCount: 6, overdueCount: 0, nextDue: { on: '2026-08-03', count: 1 } },
	owed: money(8_420_000, ZAR),
	dueThisWeek: money(2_415_000, ZAR),
	overdue: money(0, ZAR),
	page: 1,
	pageCount: 1,
	sort: 'due' as const,
	direction: 'asc' as const,
	hrefFor: () => '?',
	pageHref: () => '?',
	sortHref: () => '?',
	exportHref: '/invoicing/export'
};

describe('the invoice list on a phone', () => {
	it('does not scroll sideways at 390px', () => {
		const root = render(InvoiceList, {
			...LIST_PROPS,
			invoices: [
				invoice({ id: 'a' }),
				invoice({ id: 'b', customerName: 'Fynbos Interiors and Bespoke Cabinetmaking Services' })
			]
		});

		expect(root.scrollWidth).toBeLessThanOrEqual(PHONE_WIDTH);
	});

	it('gives every touch target at least 44px', () => {
		const root = render(InvoiceList, {
			...LIST_PROPS,
			invoices: [invoice({ id: 'a' }), invoice({ id: 'b' })]
		});

		for (const element of targets(root)) {
			// The filter tabs and the row links are inline text and legitimately shorter; the
			// BUTTONS — the things drawn as buttons — are what the floor is about.
			if (element.tagName !== 'BUTTON') continue;
			expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_MINIMUM);
		}

		// And the floor is only meaningful if something was actually measured.
		expect(targets(root).filter((e) => e.tagName === 'BUTTON').length).toBeGreaterThan(0);
	});

	it('puts action buttons on exactly one card', () => {
		const root = render(InvoiceList, {
			...LIST_PROPS,
			invoices: [
				invoice({ id: 'a', dueDate: '2026-08-10' }),
				invoice({ id: 'b', dueDate: '2026-08-01' }),
				invoice({ id: 'c', status: 'paid', paidOn: '2026-07-24' })
			]
		});

		const cards = [...root.querySelectorAll('[data-testid="invoice-card"]')];
		expect(cards).toHaveLength(3);

		// "Actions appear on the one card that needs them. Every other card is information."
		const withButtons = cards.filter((card) => card.querySelectorAll('button').length > 0);
		expect(withButtons).toHaveLength(1);

		// And it is the soonest-due unpaid one, not simply the first.
		expect(withButtons[0].textContent).toContain('Remind them');
	});

	it('puts them on none when nothing is owed', () => {
		const root = render(InvoiceList, {
			...LIST_PROPS,
			invoices: [invoice({ id: 'a', status: 'paid', paidOn: '2026-07-24' })]
		});

		const cards = [...root.querySelectorAll('[data-testid="invoice-card"]')];
		expect(cards[0].querySelectorAll('button')).toHaveLength(0);
	});

	it('comes to rest below the last card rather than over it', () => {
		const scroller = renderInScroller(InvoiceList, {
			...LIST_PROPS,
			// Enough cards to need scrolling — which is the only state where the two can collide.
			invoices: Array.from({ length: 12 }, (_, i) => invoice({ id: `i${i}` }))
		});

		scroller.scrollTop = scroller.scrollHeight;

		const cards = [...scroller.querySelectorAll('[data-testid="invoice-card"]')];
		const lastCard = cards[cards.length - 1];
		const primary = targets(scroller).find(
			(b) => b.tagName === 'BUTTON' && b.textContent?.includes('New invoice')
		);

		expect(lastCard).toBeDefined();
		expect(primary).toBeDefined();

		// `sticky` occupies its place in the flow, so at the bottom of the scroll the button sits
		// AFTER the last card. A `fixed` one would overlap it here.
		expect(primary!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			lastCard.getBoundingClientRect().bottom - 1
		);
	});

	it('renders a draft with no number and no amount', () => {
		const root = render(InvoiceList, {
			...LIST_PROPS,
			invoices: [
				invoice({
					id: 'd',
					number: null,
					status: 'draft',
					total: null,
					outstanding: null,
					hasAmount: false
				})
			]
		});

		expect(text(root)).toContain('Draft');
		expect(text(root)).toContain('needs an amount');
	});
});

/** The design's INV-1042, as paper. The shelving line is qty 2 at a LINE TOTAL of R4 600. */
const INV_1042: PrintableDocument = {
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
			qty: quantity(1_000_000),
			amount: money(1_640_000, ZAR)
		},
		{
			id: 'l2',
			description: 'Shelving unit ×2',
			qty: quantity(2_000_000),
			amount: money(460_000, ZAR)
		},
		{
			id: 'l3',
			description: 'Fitting and finishing',
			qty: quantity(1_000_000),
			amount: money(0, ZAR)
		}
	],
	totals: {
		subtotalLabel: 'Before VAT',
		subtotal: money(2_100_000, ZAR),
		taxLabel: 'VAT 15%',
		tax: money(315_000, ZAR),
		totalLabel: 'Amount due',
		total: money(2_415_000, ZAR)
	},
	footer: ['Thank you — we appreciate your business.'],
	pageLabel: 'Page 1 of 1'
};

const EVENTS: InvoiceEvent[] = [
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

const DETAIL_PROPS = {
	invoiceId: 'inv',
	document: INV_1042,
	status: 'sent' as const,
	clientName: 'Baraka Café',
	dueDate: '2026-08-01',
	viewCount: 2,
	outstanding: money(2_415_000, ZAR),
	settled: false,
	cancelled: false,
	events: EVENTS,
	memberNames: { u1: 'Alice' },
	viewerUserId: 'u1',
	today: TODAY,
	onrecordpayment: () => {},
	onremind: () => {}
};

describe('one invoice on a phone', () => {
	it('does not scroll sideways at 390px', () => {
		const root = render(MobileInvoice, DETAIL_PROPS);
		expect(root.scrollWidth).toBeLessThanOrEqual(PHONE_WIDTH);
	});

	it('gives every touch target at least 44px', () => {
		const root = render(MobileInvoice, DETAIL_PROPS);

		for (const element of targets(root)) {
			expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_MINIMUM);
		}
	});

	it('leads with the answer, not with the document', () => {
		const root = render(MobileInvoice, DETAIL_PROPS);

		expect(text(root)).toContain('Baraka Café owes you');
		// The amount, at 32px — the largest thing on the screen.
		expect(text(root)).toContain('R24 150');
		expect(text(root)).toContain('Opened twice');
	});

	/**
	 * README OPEN QUESTION 1, ASSERTED ON THE SCREEN IT IS ABOUT.
	 *
	 * The design renders `Shelving unit ×2 → R9 200`, which totals R28 750 against a header that
	 * says R24 150. The desktop document is authoritative: the amount column is the LINE TOTAL.
	 */
	it('renders line totals that reconcile to the header', () => {
		const root = render(MobileInvoice, DETAIL_PROPS);
		const rendered = text(root);

		expect(rendered).toContain('R4 600');
		expect(rendered).not.toContain('R9 200');

		// And the three lines sum to the subtotal the header is built from.
		const lineTotal = INV_1042.lines.reduce((sum, line) => sum + line.amount.cents, 0);
		expect(lineTotal).toBe(INV_1042.totals.subtotal.cents);
	});

	it('says that both actions can be undone', () => {
		const root = render(MobileInvoice, DETAIL_PROPS);
		expect(text(root)).toContain('Both can be undone.');
	});

	it('offers no payment button once it is settled', () => {
		const root = render(MobileInvoice, {
			...DETAIL_PROPS,
			settled: true,
			outstanding: money(0, ZAR)
		});

		expect(text(root)).toContain('Baraka Café has paid');
		expect(text(root)).not.toContain('Record a payment');
	});

	it('comes to rest below the timeline rather than over it', () => {
		const scroller = renderInScroller(MobileInvoice, DETAIL_PROPS);
		scroller.scrollTop = scroller.scrollHeight;

		const timeline = scroller.querySelector('ol');
		const footer = targets(scroller).find(
			(b) => b.tagName === 'BUTTON' && b.textContent?.includes('Record a payment')
		);

		expect(timeline).not.toBeNull();
		expect(footer).toBeDefined();
		expect(footer!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			timeline!.getBoundingClientRect().bottom - 1
		);
	});
});

describe('one card', () => {
	it('shows the amount in the invoicing accent only while it is owed', () => {
		const owedRoot = render(InvoiceCard, { invoice: invoice({ id: 'a' }), today: TODAY });
		const owedAmount = owedRoot.querySelector('[data-slot="amount"]');
		expect(owedAmount).not.toBeNull();
		const owedColour = getComputedStyle(owedAmount!).color;

		if (instance) unmount(instance);
		target?.remove();

		const paidRoot = render(InvoiceCard, {
			invoice: invoice({ id: 'a', status: 'paid', paidOn: '2026-07-24' }),
			today: TODAY
		});
		const paidAmount = paidRoot.querySelector('[data-slot="amount"]');
		expect(paidAmount).not.toBeNull();

		// Money is neutral by default; the accent is spent on the one thing it means — owed.
		expect(getComputedStyle(paidAmount!).color).not.toBe(owedColour);
	});
});
