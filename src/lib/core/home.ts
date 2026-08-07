/**
 * WHAT HOME RENDERS.
 *
 * The shapes only — every query lives in `$lib/server/core/home`, which is the half that
 * touches a database and must never be importable from a component. Same split as
 * `$lib/core/search`: this file is the wire format both ends agree on.
 *
 * HOME IS AN AGGREGATION, NOT A SCREEN WITH DATA IN IT
 * ---------------------------------------------------
 * Every panel below is a LIST that owned modules contribute rows to. Nothing here names a
 * quote, an invoice or a stock item, and nothing here special-cases a module — which is what
 * makes "a business with one module gets a coherent Home, not gaps" a property of the code
 * rather than a promise. An eighth module contributes by existing; Home does not learn its
 * name.
 *
 * The five panels arrive SEPARATELY (see `home/load.ts`), so each type below is what one
 * streamed promise resolves to.
 */
import type { Money } from '$lib/core/money';
import type { ModuleKey } from '$lib/core/modules/catalogue';

/** The five panels, named so a contributor can declare which ones it feeds. */
export const HOME_PANELS = ['standing', 'resume', 'figures', 'agenda'] as const;

export type PanelKey = (typeof HOME_PANELS)[number];

/**
 * CLEAR OR NOT.
 *
 * The design's thesis in one word. The default state is that nothing needs you and the
 * interface says so — but a panel that can only ever say "all clear" is decoration, so every
 * contribution carries this and the panel is the roll-up of them.
 */
export type Standing = 'clear' | 'attention';

/**
 * One module's answer to "how are things?", in the two sizes the design draws: a 14px
 * statement and a 12px explanation.
 *
 * Both are written by the contributing module, because only it knows what its own good news
 * sounds like. `href` is where somebody goes about it, and is null when there is nothing to
 * go and do — an all-clear reassurance is not a link.
 */
export type StandingPoint = {
	readonly module: ModuleKey;
	readonly standing: Standing;
	readonly statement: string;
	readonly explanation: string;
	readonly href: string | null;
};

export type StandingPanel = {
	readonly standing: Standing;
	/** "You're all clear." / "Two things need you." */
	readonly headline: string;
	readonly explanation: string;
	/** Concerns first, then reassurances. Three across on desktop. */
	readonly points: readonly StandingPoint[];
	/**
	 * Modules that did not answer in time, by name.
	 *
	 * Named rather than hidden: "all clear" while a module was unreachable is the one lie this
	 * screen cannot afford, since the whole panel is a claim about everything at once.
	 */
	readonly unavailable: readonly string[];
};

/**
 * A draft to go back to. Any module can contribute one.
 *
 * `context` is required and must name concrete progress — "3 of 5 items priced". A resume
 * card that says only "Draft" is a link with extra steps; the design's version tells you what
 * you will find when you get there.
 */
export type ResumeCard = {
	readonly module: ModuleKey;
	readonly id: string;
	readonly title: string;
	readonly context: string;
	readonly href: string;
};

/**
 * THIS MONTH, PLAINLY — three slots, fixed, in the design's order.
 *
 * Slots rather than a list, because the three cards are a sentence about the shape of the
 * month and a business with no Invoicing must still be told what it does not know. A missing
 * contribution renders the card with no figure and an honest footnote; it never renders R0,
 * which would be a claim rather than a gap.
 */
export const FIGURE_SLOTS = ['owed-to-you', 'you-owe', 'paid-to-you'] as const;

export type FigureSlot = (typeof FIGURE_SLOTS)[number];

/**
 * Colour is meaning, so it is a decision and not a class name on the wire.
 *
 * `receivable` is the only emphasised card in the design. The invoice list's rule applies
 * here: money is neutral, colour flags the exception.
 */
export type FigureEmphasis = 'receivable' | 'plain';

export type MonthCard = {
	readonly slot: FigureSlot;
	readonly label: string;
	/** Null when nothing owns this slot — the empty state, not a zero. */
	readonly amount: Money | null;
	readonly footnote: string;
	readonly emphasis: FigureEmphasis;
};

/**
 * COMING UP. A 46px mono date, then the item.
 *
 * `dateLabel` is formatted on the SERVER in the business's locale, like every other date that
 * crosses this boundary — a `toLocaleDateString` in the component renders one string during
 * SSR and another in a browser three timezones away.
 */
export type AgendaRow = {
	readonly id: string;
	readonly dateLabel: string;
	readonly title: string;
	/** The second line — "VAT return · already prepared". Null when the item is self-evident. */
	readonly detail: string | null;
};

/** YOUR MODULES. Price per row, and the total the sidebar and the switcher also show. */
export type ModuleLine = {
	readonly module: ModuleKey;
	readonly price: Money;
};

export type ModulesPanel = {
	readonly lines: readonly ModuleLine[];
	readonly total: Money;
};

/**
 * The roll-up. One concern anywhere means the panel is not all clear.
 *
 * Deliberately not a majority or a score: "mostly fine" is not a thing to tell somebody about
 * their own business, and a single unchased quote is exactly the kind of small thing this
 * screen exists to surface before it becomes a large one.
 */
export function standingOf(points: readonly StandingPoint[]): Standing {
	return points.some((point) => point.standing === 'attention') ? 'attention' : 'clear';
}

/**
 * Concerns first, in contribution order otherwise.
 *
 * A stable sort, so two businesses with the same modules read their reassurances in the same
 * order and a returning owner's eye lands where it did yesterday.
 */
export function orderPoints(points: readonly StandingPoint[]): readonly StandingPoint[] {
	return [...points].sort((a, b) => rank(a) - rank(b));
}

function rank(point: StandingPoint): number {
	return point.standing === 'attention' ? 0 : 1;
}

/**
 * THE PANEL'S OWN TWO SENTENCES.
 *
 * Generated rather than written, because the not-all-clear variant has to hold the same calm
 * register while saying something different. The rules:
 *
 *   - Count what needs you, and say the number. "Two things need you" is a fact somebody can
 *     act on; "You have items requiring attention" is a notification badge in prose.
 *   - Never manufacture urgency. Nothing is red, nothing counts down, and the second sentence
 *     always says that everything else is fine — because it is.
 *   - Say when it was checked. The design's "Checked a minute ago" is the sentence that earns
 *     the panel its confidence, so it is true rather than decorative.
 */
export function standingCopy(
	standing: Standing,
	concerns: number,
	checked: string
): { headline: string; explanation: string } {
	if (standing === 'clear') {
		return {
			headline: "You're all clear.",
			explanation: `Nothing needs you today. ${checked} — if that changes, you'll see it here first.`
		};
	}

	return {
		headline: `${capitalise(count(concerns))} ${concerns === 1 ? 'thing needs' : 'things need'} you.`,
		explanation: `Everything else is fine. ${checked} — nothing else needs you today.`
	};
}

/**
 * Small numbers in words, as somebody would say them. Above ten the numeral reads better.
 *
 * Ten is a generous ceiling for a screen whose whole argument is that this list is usually
 * empty; a business with eleven concerns has bigger problems than the typography.
 */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function count(n: number): string {
	return WORDS[n] ?? String(n);
}

function capitalise(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
