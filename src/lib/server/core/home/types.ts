/**
 * WHAT A MODULE CONTRIBUTES TO HOME.
 *
 * Home does not query Quoting. Quoting answers a question Home asks of everything it owns,
 * and Home arranges the answers — which is the only version of this screen that survives an
 * eighth module, and the only one where a business with a single module gets a coherent page
 * instead of five panels of gaps.
 *
 * The contract is deliberately narrow. A contributor gets a scoped transaction, its business
 * and the clock, and returns four small lists. It cannot reach another module, cannot decide
 * what the panel says about it, and cannot render anything: `compose.ts` orders, labels and
 * words the result. That is what stops "the dashboard" from slowly becoming the place every
 * module keeps a second, divergent copy of its own summary logic.
 *
 * ONE CLOCK READING
 * -----------------
 * `now` is a parameter, for the same reason it is one in `offers.ts`: the greeting, the
 * "checked just now", every date in Coming up and the renewal row all describe one instant.
 * Separate `new Date()` calls inside one page load can straddle midnight, and a dashboard
 * that greets you with Friday evening and dates its agenda from Saturday is a bug somebody
 * only ever sees at the worst possible time.
 */
import type { Money } from '$lib/core/money';
import type { ModuleKey } from '$lib/core/modules/catalogue';
import type { AgendaRow, FigureSlot, PanelKey, ResumeCard, StandingPoint } from '$lib/core/home';
import type { Business } from '../db/map';
import type { Tx } from '../db/tx';
import type { AccessMap } from '../entitlement';

/** Everything a contributor is given. No `event`, no fetch, no other module. */
export type SummaryInput = {
	readonly tx: Tx;
	readonly business: Business;
	/** What else this business owns — so a contribution can be honest about a neighbour. */
	readonly access: AccessMap;
	readonly now: Date;
};

/** A figure for one of the three money cards, before the card is labelled. */
export type FigureContribution = {
	readonly slot: FigureSlot;
	readonly amount: Money;
	/** "Across 6 invoices · none overdue". Counted, never written. */
	readonly footnote: string;
	/** Overrides the slot's default label, for a module that names it better. */
	readonly label?: string;
};

/**
 * A dated item for Coming up.
 *
 * The DATE crosses as a `Date` and is formatted by `compose.ts` in the business's locale —
 * a contributor that formatted its own would be a second place for the product to disagree
 * with itself about what "8 Aug" looks like.
 */
export type AgendaContribution = {
	readonly id: string;
	readonly on: Date;
	readonly title: string;
	readonly detail: string | null;
};

/**
 * One module's whole answer.
 *
 * Every field is a list or a nullable, and `NOTHING_TO_REPORT` is a legitimate answer —
 * a module with nothing to say says nothing, rather than padding the screen to look busy.
 */
export type ModuleSummary = {
	/** At most one. A module that raised three separate alarms would drown out the others. */
	readonly standing: StandingPoint | null;
	readonly resume: readonly ResumeCard[];
	readonly figures: readonly FigureContribution[];
	readonly agenda: readonly AgendaContribution[];
};

export const NOTHING_TO_REPORT: ModuleSummary = Object.freeze({
	standing: null,
	resume: Object.freeze([]),
	figures: Object.freeze([]),
	agenda: Object.freeze([])
});

export type ModuleSummarySource = (input: SummaryInput) => Promise<ModuleSummary>;

/**
 * A registered contributor.
 *
 * `panels` is what makes per-panel streaming real. Home waits for the modules that feed a
 * panel and no others, so an unhappy Inventory delays Coming up and leaves the money cards
 * alone. Declared rather than inferred, because the answer has to be known BEFORE the query
 * runs — inferring it from what came back would mean waiting for everything to find out what
 * we were waiting for.
 */
export type SummaryContributor = {
	readonly module: ModuleKey;
	readonly panels: readonly PanelKey[];
	readonly summarise: ModuleSummarySource;
};

/** What one contributor's attempt produced. `failed` is a first-class outcome, not an error. */
export type Contribution =
	| { readonly status: 'ok'; readonly module: ModuleKey; readonly summary: ModuleSummary }
	| { readonly status: 'failed'; readonly module: ModuleKey };

export type { AgendaRow, PanelKey, ResumeCard, StandingPoint };
