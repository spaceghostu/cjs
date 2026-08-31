/**
 * THE PHONE ASSERTIONS FOR HOME — SPA-16.
 *
 * Runs in a real Chromium at 390 × 844, the design's reference frame, under the `mobile`
 * Vitest project. Every claim here is a fact about LAYOUT: asserting the class `py-3.5`
 * would pass while a parent's line-height quietly made the row 38px, which is the recorded
 * rationale of the shell and invoicing specs this one is modelled on.
 *
 * WHAT COUNTS AS A TAPPABLE ROW ON HOME. The resume cards are the screen's row-shaped
 * targets — whole rows drawn as things to press — so they carry the 44px floor. The other
 * links on the page (a standing point's statement, "Add or remove" under the module list)
 * are inline text links inside prose, the same category the invoicing spec exempts with
 * "the filter tabs and the row links are inline text and legitimately shorter". ComingUp
 * and the month cards have no targets at all: they are reference, not controls.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, type Component } from 'svelte';
// The real stylesheet. Without it every padding class is inert and a height assertion
// measures nothing but the default line box — which would pass for the wrong reason.
import '../../../routes/layout.css';
import { money } from '$lib/core/money/ctor';
import { ZAR } from '$lib/core/money';
import type {
	AgendaRow,
	ModulesPanel,
	MonthCard,
	ResumeCard,
	StandingPanel as StandingPanelData
} from '$lib/core/home';
import ComingUp from './ComingUp.svelte';
import MonthPanel from './MonthPanel.svelte';
import ResumePanel from './ResumePanel.svelte';
import StandingPanel from './StandingPanel.svelte';
import YourModules from './YourModules.svelte';

/** The design's minimum. Apple's HIG and the WCAG 2.2 target-size floor agree on it. */
const TOUCH_MINIMUM = 44;
const PHONE_WIDTH = 390;

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

afterEach(() => {
	if (instance) unmount(instance);
	target?.remove();
	instance = null;
	target = null;
});

const RESUME_CARDS: readonly ResumeCard[] = [
	{
		module: 'quoting',
		id: 'qt-1',
		title: 'Quote for Baraka Café',
		context: '3 of 5 items priced',
		href: '/quoting/qt-1'
	},
	{
		module: 'invoicing',
		id: 'inv-1',
		title: 'Invoice for Fynbos Interiors and Bespoke Cabinetmaking Services',
		context: 'Needs a due date',
		href: '/invoicing/inv-1'
	}
];

const STANDING: StandingPanelData = {
	standing: 'attention',
	headline: 'Two things need you.',
	explanation: 'Everything else is fine. Checked a minute ago — nothing else needs you today.',
	points: [
		{
			module: 'quoting',
			standing: 'attention',
			statement: 'A quote has gone quiet.',
			explanation: 'QT-1036 was opened nine days ago and not answered.',
			href: '/quoting/qt-1036'
		},
		{
			module: 'inventory',
			standing: 'clear',
			statement: 'Stock levels are fine.',
			explanation: 'Nothing has fallen below its reorder level.',
			href: null
		}
	],
	unavailable: []
};

const MONTH_CARDS: readonly MonthCard[] = [
	{
		slot: 'owed-to-you',
		label: 'Owed to you',
		amount: money(8_420_000, ZAR),
		footnote: 'Across 6 unpaid invoices',
		emphasis: 'receivable'
	},
	{
		slot: 'you-owe',
		label: 'You owe',
		amount: null,
		footnote: 'Payroll would fill this in',
		emphasis: 'plain'
	},
	{
		slot: 'paid-to-you',
		label: 'Paid to you',
		amount: money(3_650_000, ZAR),
		footnote: 'Three invoices settled this month',
		emphasis: 'plain'
	}
];

const AGENDA_ROWS: readonly AgendaRow[] = [
	{ id: 'a1', dateLabel: '31 Jul', title: 'VAT return', detail: 'Already prepared' },
	{ id: 'a2', dateLabel: '1 Aug', title: 'INV-1042 falls due', detail: 'Baraka Café · R24 150' }
];

const MODULES: ModulesPanel = {
	lines: [
		{ module: 'quoting', price: money(12_000, ZAR) },
		{ module: 'invoicing', price: money(15_000, ZAR) },
		{ module: 'inventory', price: money(18_000, ZAR) }
	],
	total: money(45_000, ZAR)
};

describe('home on a phone', () => {
	it('gives every resume row at least 44px', () => {
		const root = render(ResumePanel, { cards: RESUME_CARDS });

		const rows = [...root.querySelectorAll<HTMLElement>('a')];
		for (const row of rows) {
			expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(TOUCH_MINIMUM);
		}

		// And the floor is only meaningful if something was actually measured.
		expect(rows.length).toBeGreaterThan(0);
	});

	it('does not scroll sideways at 390px', () => {
		// Each panel alone in the 390px frame — a long client name, three month cards forced
		// into one column, a 46px date gutter — because any one of them overflowing is the
		// whole page overflowing.
		const overflowed = (root: HTMLElement) => root.scrollWidth > PHONE_WIDTH;

		expect(overflowed(render(StandingPanel, { panel: STANDING }))).toBe(false);
		if (instance) unmount(instance);
		target?.remove();

		expect(overflowed(render(ResumePanel, { cards: RESUME_CARDS }))).toBe(false);
		if (instance) unmount(instance);
		target?.remove();

		expect(overflowed(render(MonthPanel, { cards: MONTH_CARDS }))).toBe(false);
		if (instance) unmount(instance);
		target?.remove();

		expect(overflowed(render(ComingUp, { rows: AGENDA_ROWS }))).toBe(false);
		if (instance) unmount(instance);
		target?.remove();

		expect(overflowed(render(YourModules, { panel: MODULES }))).toBe(false);
	});
});
