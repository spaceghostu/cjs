/**
 * HOME'S PANELS, AS LITERALS.
 *
 * `$lib/core/home` is deliberately just shapes — every panel type is "what one streamed
 * promise resolves to" — so a story can hand a panel exactly what the server would, with no
 * server. The two sentences on the standing panel are GENERATED through `standingCopy`, the
 * same function the real contributors call, so the stories hold the production copy rather
 * than a hand-written imitation of it.
 *
 * Money goes through `parseMoneyInput`, the only door a non-test file has — ESLint zone 5
 * keeps `$lib/core/money/ctor` out of `src/stories/**`, and `Modules.stories.svelte` records
 * why that is a good thing.
 */
import {
	orderPoints,
	standingCopy,
	standingOf,
	type AgendaRow,
	type ModulesPanel,
	type MonthCard,
	type ResumeCard,
	type StandingPanel,
	type StandingPoint
} from '$lib/core/home';
import { parseMoneyInput, type Money } from '$lib/core/money';

function money(input: string): Money {
	const parsed = parseMoneyInput(input);
	if (!parsed.ok) throw new Error(parsed.message);
	return parsed.value;
}

/** "Checked a minute ago" — the sentence that earns the panel its confidence. */
const CHECKED = 'Checked a minute ago';

const CLEAR_POINTS: readonly StandingPoint[] = [
	{
		module: 'quoting',
		standing: 'clear',
		statement: 'Nothing waiting on a quote.',
		explanation: 'Every quote you sent has been answered.',
		href: null
	},
	{
		module: 'invoicing',
		standing: 'clear',
		statement: 'Nothing overdue.',
		explanation: 'Six invoices out, all inside their terms.',
		href: null
	},
	{
		module: 'inventory',
		standing: 'clear',
		statement: 'Stock levels are fine.',
		explanation: 'Nothing has fallen below its reorder level.',
		href: null
	}
];

const MIXED_POINTS: readonly StandingPoint[] = [
	...CLEAR_POINTS.slice(2),
	{
		module: 'quoting',
		standing: 'attention',
		statement: 'A quote has gone quiet.',
		explanation: 'QT-1036 was opened nine days ago and not answered.',
		href: '/quoting/qt-1036'
	},
	{
		module: 'invoicing',
		standing: 'attention',
		statement: 'One invoice is overdue.',
		explanation: 'INV-1038 was due on Friday.',
		href: '/invoicing/inv-1038'
	}
];

function panelFrom(points: readonly StandingPoint[], unavailable: readonly string[] = []) {
	const standing = standingOf(points);
	const concerns = points.filter((point) => point.standing === 'attention').length;
	return {
		standing,
		...standingCopy(standing, concerns, CHECKED),
		points: orderPoints(points),
		unavailable
	} satisfies StandingPanel;
}

export const STANDING_CLEAR: StandingPanel = panelFrom(CLEAR_POINTS);

export const STANDING_ATTENTION: StandingPanel = panelFrom(MIXED_POINTS);

/** The one lie the panel cannot afford, avoided by name: a module that did not answer. */
export const STANDING_UNAVAILABLE: StandingPanel = panelFrom(CLEAR_POINTS.slice(0, 2), [
	'Inventory'
]);

export const RESUME_CARDS: readonly ResumeCard[] = [
	{
		module: 'quoting',
		id: 'qt-draft-1',
		title: 'Quote for Baraka Café',
		context: '3 of 5 items priced',
		href: '/quoting/qt-draft-1'
	},
	{
		module: 'invoicing',
		id: 'inv-draft-1',
		title: 'Invoice for Fynbos Interiors',
		context: 'Needs a due date',
		href: '/invoicing/inv-draft-1'
	}
];

/** The three fixed slots, in the design's order — a sentence about the shape of the month. */
export const MONTH_CARDS: readonly MonthCard[] = [
	{
		slot: 'owed-to-you',
		label: 'Owed to you',
		amount: money('84200.00'),
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
		amount: money('36500.00'),
		footnote: 'Three invoices settled this month',
		emphasis: 'plain'
	}
];

export const AGENDA_ROWS: readonly AgendaRow[] = [
	{
		id: 'ag-1',
		dateLabel: '31 Jul',
		title: 'VAT return',
		detail: 'Already prepared'
	},
	{
		id: 'ag-2',
		dateLabel: '1 Aug',
		title: 'INV-1042 falls due',
		detail: 'Baraka Café · R24 150'
	},
	{
		id: 'ag-3',
		dateLabel: '4 Aug',
		title: 'Site visit — Kloof Street fit-out',
		detail: null
	}
];

/** The design's tenant: Quoting, Invoicing and Inventory, at R450 a month. */
export const MODULES_PANEL: ModulesPanel = {
	lines: [
		{ module: 'quoting', price: money('120.00') },
		{ module: 'invoicing', price: money('150.00') },
		{ module: 'inventory', price: money('180.00') }
	],
	total: money('450.00')
};
