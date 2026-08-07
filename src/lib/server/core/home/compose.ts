/**
 * ARRANGING WHAT THE MODULES SAID.
 *
 * Pure functions over contributions — no database, no clock of their own, no `event`. Every
 * decision this screen makes about ORDER, LABELS and EMPTINESS is here, which is what lets
 * the interesting cases be tested without a business: one module, no modules, a module that
 * did not answer, a concern among reassurances.
 *
 * THE RULE THAT SHAPES ALL OF IT
 * -----------------------------
 * A gap is stated, never filled. Every function below has an answer for "nothing contributed
 * this", and none of those answers is a zero, a dash, or a panel quietly missing from the
 * page. The design's confidence rests on the screen being complete; a card that renders R0
 * because nobody answered is the one failure mode that turns reassurance into misinformation.
 */
import { billingDate } from '$lib/core/money';
import { label } from '$lib/core/modules/catalogue';
import { FIGURE_SLOTS, orderPoints, standingCopy, standingOf } from '$lib/core/home';
import type {
	AgendaRow,
	FigureEmphasis,
	FigureSlot,
	MonthCard,
	ResumeCard,
	StandingPanel
} from '$lib/core/home';
import type { ModuleKey } from '$lib/core/modules/catalogue';
import type { AccessMap } from '../entitlement';
import type { AgendaContribution, Contribution } from './types';

/**
 * "Checked just now", and it is.
 *
 * The design's line is "Checked a minute ago". Every figure on this page was read during this
 * request, so the true version of that sentence is the present tense — and a page that
 * claimed a minute had passed would be inventing the one detail that makes the claim
 * trustworthy.
 */
const CHECKED = 'Checked just now';

/** Coming up is a column beside the page, not a calendar. A contributor sends what is near. */
const AGENDA_ROWS = 6;

/** One card per module at most: the rest of the drafts are the module's own screen. */
const RESUME_CARDS = 3;

export function composeStanding(contributions: readonly Contribution[]): StandingPanel {
	const points = orderPoints(collect(contributions, (s) => (s.standing ? [s.standing] : [])));
	const standing = standingOf(points);
	const concerns = points.filter((p) => p.standing === 'attention').length;
	const { headline, explanation } = standingCopy(standing, concerns, CHECKED);

	return {
		standing,
		headline,
		explanation,
		points,
		unavailable: failures(contributions).map(label)
	};
}

export function composeResume(contributions: readonly Contribution[]): readonly ResumeCard[] {
	return collect<ResumeCard>(contributions, (s) => s.resume).slice(0, RESUME_CARDS);
}

/**
 * The three money cards, in the design's order, whether or not anybody filled them.
 *
 * A slot's owner is a fact about the product — only Invoicing knows what is owed — so the
 * empty copy can say WHICH truth is missing. "Invoicing isn't part of your business" and
 * "Nothing invoiced yet" are different sentences to different people, and both are better
 * than a card showing nothing at all.
 */
export function composeFigures(
	contributions: readonly Contribution[],
	access: AccessMap,
	now: Date,
	locale: string
): readonly MonthCard[] {
	const contributed = new Map(
		collect(contributions, (s) => s.figures).map((figure) => [figure.slot, figure])
	);
	const unreachable = new Set(failures(contributions));

	return FIGURE_SLOTS.map((slot) => {
		const meta = SLOT_META[slot];
		const figure = contributed.get(slot);
		const heading = figure?.label ?? meta.label(now, locale);

		if (figure) {
			return {
				slot,
				label: heading,
				amount: figure.amount,
				footnote: figure.footnote,
				emphasis: meta.emphasis
			};
		}

		return {
			slot,
			label: heading,
			amount: null,
			footnote: unreachable.has(meta.owner)
				? `${label(meta.owner)} didn't answer just now. Nothing is wrong with your figures.`
				: meta.absent(access[meta.owner] === 'write'),
			emphasis: meta.emphasis
		};
	});
}

export function composeAgenda(
	contributions: readonly Contribution[],
	platform: readonly AgendaContribution[],
	locale: string
): readonly AgendaRow[] {
	const items = [...collect<AgendaContribution>(contributions, (s) => s.agenda), ...platform];

	return items
		.slice()
		.sort((a, b) => a.on.getTime() - b.on.getTime())
		.slice(0, AGENDA_ROWS)
		.map((item) => ({
			id: item.id,
			dateLabel: item.on.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
			title: item.title,
			detail: item.detail
		}));
}

type SlotMeta = {
	readonly owner: ModuleKey;
	readonly emphasis: FigureEmphasis;
	readonly label: (now: Date, locale: string) => string;
	/** What the card says when nothing filled it. `owned` distinguishes the two reasons. */
	readonly absent: (owned: boolean) => string;
};

const SLOT_META: Readonly<Record<FigureSlot, SlotMeta>> = Object.freeze({
	'owed-to-you': {
		owner: 'invoicing',
		/** The only coloured figure on the page. Money is neutral; colour flags the exception. */
		emphasis: 'receivable',
		label: () => 'Money owed to you',
		absent: (owned) =>
			owned ? 'Nothing invoiced yet.' : "Invoicing isn't part of your business yet."
	},
	'you-owe': {
		/**
		 * Expenses has an accent colour in the design and no catalogue row, no price and no
		 * screens — so this card cannot be filled by anything that exists, and inventing
		 * supplier bills to fill it was never on the table. It states what it would take.
		 */
		owner: 'expenses',
		emphasis: 'plain',
		label: () => 'Money you owe',
		absent: () => "Supplier bills arrive with Expenses, which isn't available yet."
	},
	'paid-to-you': {
		owner: 'invoicing',
		emphasis: 'plain',
		label: (now, locale) => `Paid to you in ${previousMonth(now, locale)}`,
		absent: (owned) =>
			owned ? 'Nothing received yet.' : "Invoicing isn't part of your business yet."
	}
});

/**
 * The month that just ended, named.
 *
 * `billingDate` rather than `getMonth()`: the rest of the product decides what month it is in
 * SAST, and a card headed "Paid to you in July" that disagrees with the invoice list on the
 * evening of the 31st would be the same off-by-one bug that makes a wrong bill.
 */
function previousMonth(now: Date, locale: string): string {
	const { year, month } = billingDate(now);
	// Month 1 -> December of the previous year. `Date.UTC` normalises the roll-over.
	return new Date(Date.UTC(year, month - 2, 1)).toLocaleDateString(locale, {
		month: 'long',
		timeZone: 'UTC'
	});
}

/** Every contribution's rows for one panel, in registry order. Failures contribute nothing. */
function collect<T>(
	contributions: readonly Contribution[],
	pick: (summary: SummaryOf) => readonly T[]
): T[] {
	return contributions.flatMap((c) => (c.status === 'ok' ? [...pick(c.summary)] : []));
}

type SummaryOf = Extract<Contribution, { status: 'ok' }>['summary'];

function failures(contributions: readonly Contribution[]): readonly ModuleKey[] {
	return contributions.flatMap((c) => (c.status === 'failed' ? [c.module] : []));
}
