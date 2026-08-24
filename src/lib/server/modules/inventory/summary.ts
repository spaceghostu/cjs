/**
 * INVENTORY'S CONTRIBUTION TO HOME.
 *
 * The design's reassurance is "Stock levels healthy / 48 items counted, none running low" — and
 * the concern it must be able to become is the same sentence with the other answer: items below
 * their reorder point, NAMED and counted. SPA-5 gave the module storage, so this is now the real
 * query the `readiness` seam stood in for — and the panel around it did not move, which was the
 * point of the seam.
 *
 * THE CONCERN NAMES THINGS. "3 items are running low · Danish oil, European oak and one other"
 * rather than "check your stock". A standing point that only said something was wrong would make
 * a person open the module to find out what, which is the opposite of what this panel is for.
 * Both sentences are generated in `copy.ts`, so neither is a template somebody filled in.
 *
 * THE COUNT IS THE RESUME CASE. A stock count is long, it gets interrupted, and coming back to it
 * is the normal way it gets done — so a part-finished one appears with its progress ("18 of 48
 * counted") rather than as a bare link.
 *
 * INVENTORY CONTRIBUTES NO FIGURE. Stock on hand is an asset, not money in or out this month, and
 * putting a valuation on the same row as "Money owed to you" would invite the two to be read as
 * the same kind of number. The registry declares `panels: ['standing','resume']`, so Home never
 * even asks — `figures: []` here is the second lock on the same door.
 */
import { countProgressLine, countTitle, homeStandingCopy } from '$lib/core/inventory';
import { readiness } from '$lib/server/core/home/readiness';
import type {
	ModuleSummary,
	ResumeCard,
	StandingPoint,
	SummaryInput
} from '$lib/server/core/home/types';
import { stockStanding, unfinishedCount } from './queries';

export async function summariseInventory(input: SummaryInput): Promise<ModuleSummary> {
	const [standing, resume] = await Promise.all([howStockStands(input), countInProgress(input)]);

	return { standing, resume, figures: [], agenda: [] };
}

/** "48 items counted · None running low." — or the same sentence with the other answer. */
async function howStockStands(input: SummaryInput): Promise<StandingPoint | null> {
	const { itemCount, lowCount, lowNames } = await stockStanding(input.tx);

	if (itemCount === 0) {
		// Nothing counted yet. That is not silence — a business that added Inventory last week and
		// has not put anything in it still wants to be told the module is there and working.
		return readiness(input, 'inventory', {
			statement: 'Inventory is ready when you are',
			nothingYet: 'Nothing counted yet.'
		});
	}

	const { statement, explanation } = homeStandingCopy(itemCount, lowNames, lowCount);

	return {
		module: 'inventory',
		// An item below the point its owner chose IS the fact. No threshold on top of a threshold,
		// and no ageing: `isBelowReorderPoint` is strictly-below, so a reorder point of zero already
		// means "never tell me" and a point hit exactly is not a concern.
		standing: lowCount > 0 ? 'attention' : 'clear',
		statement,
		explanation,
		// The concern links to the list already filtered to what it is about, so "3 items are
		// running low" is one click from the three items. Same shape as `/invoicing?filter=overdue`.
		href: lowCount > 0 ? '/inventory?filter=low' : '/inventory'
	};
}

/**
 * The stock count to go back to — one card, never a list.
 *
 * `ResumeCard` requires a context line and the design's own version names concrete progress, so
 * the count is counted rather than described: "18 of 48 counted" tells somebody what they will
 * find when they get there, which is the whole difference between this and a link.
 */
async function countInProgress(input: SummaryInput): Promise<readonly ResumeCard[]> {
	const count = await unfinishedCount(input.tx);
	if (!count) return [];

	return [
		{
			module: 'inventory',
			id: count.id,
			title: countTitle(count.periodStart, count.periodEnd, input.business.locale),
			// A prepared count with no lines is a real state — a business with nothing placed
			// anywhere gets one — and "0 of 0 counted" is not progress. Same answer as an empty
			// draft quote's "Nothing on it yet".
			context:
				count.total === 0 ? 'Nothing to count yet' : countProgressLine(count.counted, count.total),
			// SPA-7 owns this route. Until it lands nothing in the interface creates a count, so
			// this card cannot appear outside a seeded database.
			href: `/inventory/count/${count.id}`
		}
	];
}
