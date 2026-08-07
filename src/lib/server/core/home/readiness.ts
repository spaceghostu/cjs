/**
 * WHAT A MODULE SAYS ON HOME BEFORE ANYONE HAS USED IT.
 *
 * Three of the seven modules have screens in the design and none of them has storage yet —
 * quotes land in T15, invoices in T19, stock in T23. Until then a contributor cannot count
 * what it does not have, and there are exactly two honest things to do: say nothing, or say
 * the true thing that IS derivable today.
 *
 * The true thing is the subscription. This business owns the module, the period says since
 * when, and — because the module has no storage at all yet — "nothing in it yet" is a fact
 * rather than a guess. So a freshly-added Invoicing reassures with "Added 14 July. Nothing
 * invoiced yet", which is what somebody who added it last week actually needs to read.
 *
 * WHAT REPLACES THIS
 * ------------------
 * T16, T20 and T24 each replace their module's call to this function with a count of the
 * thing the design's reassurance names — "3 quotes waiting on clients", "48 items counted,
 * none running low". This is the seam, not the destination, and every caller says so.
 *
 * Nothing here invents a figure. A module with no data contributes a sentence about having no
 * data, and the panel around it is composed the same way it will be when the counts are real.
 */
import { openPeriod, loadSubscriptions } from '../modules/subscriptions';
import type { StandingPoint } from '$lib/core/home';
import type { ModuleKey } from '$lib/core/modules/catalogue';
import type { SummaryInput } from './types';

export type ReadinessWords = {
	/** 14px. "Quoting is ready when you are." */
	readonly statement: string;
	/** Completes "Added 14 July. ___" — "Nothing quoted yet." */
	readonly nothingYet: string;
};

/**
 * The reassurance a module with nothing in it can truthfully offer.
 *
 * Null when there is no open period, which for a module Home has asked at all means the
 * subscription changed underneath this request. Contributing nothing is the right answer to
 * that: the panel is a claim about right now, and half a claim is worse than none.
 */
export async function readiness(
	input: SummaryInput,
	module: ModuleKey,
	words: ReadinessWords
): Promise<StandingPoint | null> {
	const period = openPeriod(await loadSubscriptions(input.tx), module);
	if (!period) return null;

	const since = period.startedAt.toLocaleDateString(input.business.locale, {
		day: 'numeric',
		month: 'long'
	});

	return {
		module,
		// Never `attention`. Not having used something yet is not a problem, and a dashboard
		// that treats an empty module as a task is the manufactured urgency this design is
		// explicitly built against.
		standing: 'clear',
		statement: words.statement,
		explanation: `Added ${since}. ${words.nothingYet}`,
		href: null
	};
}
