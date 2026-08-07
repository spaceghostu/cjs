/**
 * INVENTORY'S CONTRIBUTION TO HOME.
 *
 * The design's reassurance is "Stock levels healthy / 48 items counted, none running low" —
 * and the concern it must be able to become is the same sentence with the other answer:
 * items below their reorder point, named and counted. Both need `inventory_item`, which lands
 * in T23.
 *
 * WHAT T24 CHANGES HERE
 * ---------------------
 *   - `standing`: items counted, and how many are under their reorder point. `attention` when
 *     any are, with the count — not "check your stock".
 *   - `resume`: a stock count left part-finished, with the progress ("18 of 48 counted").
 *     The count flow is the design's clearest resume case: it is long, it is interrupted, and
 *     coming back to it is the normal way it gets done.
 *
 * Inventory contributes no figure. Stock on hand is an asset, not money in or out this month,
 * and putting a valuation on the same row as "Money owed to you" would invite the two to be
 * read as the same kind of number.
 */
import { readiness } from '$lib/server/core/home/readiness';
import {
	NOTHING_TO_REPORT,
	type ModuleSummary,
	type SummaryInput
} from '$lib/server/core/home/types';

export async function summariseInventory(input: SummaryInput): Promise<ModuleSummary> {
	const standing = await readiness(input, 'inventory', {
		statement: 'Inventory is ready when you are',
		nothingYet: 'Nothing counted yet.'
	});

	return standing ? { ...NOTHING_TO_REPORT, standing } : NOTHING_TO_REPORT;
}
