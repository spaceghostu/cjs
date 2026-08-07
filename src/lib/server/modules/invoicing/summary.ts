/**
 * INVOICING'S CONTRIBUTION TO HOME.
 *
 * Invoicing is the only module that feeds all four panels, because it is the only one that
 * knows about money coming in. Two of the design's three money cards are its answers:
 *
 *   owed-to-you   "Across 6 invoices · none overdue"
 *   paid-to-you   last full month's receipts, with the month before it as the footnote
 *
 * There is no `invoicing_invoice` table until T19, so neither figure can be counted, and an
 * uncounted figure is not contributed at all — `compose.ts` renders the card's honest empty
 * state rather than R0. R0 owed and nothing to go on look identical on a card and mean
 * opposite things.
 *
 * WHAT T20 CHANGES HERE
 * ---------------------
 *   - `figures`: the two sums above, each with its counted footnote.
 *   - `standing`: overdue invoices — the one place on this screen that legitimately says
 *     `attention`, and even then it states the fact and links to the list.
 *   - `resume`: the most recent draft invoice.
 *   - `agenda`: invoices falling due in the next while.
 */
import { readiness } from '$lib/server/core/home/readiness';
import {
	NOTHING_TO_REPORT,
	type ModuleSummary,
	type SummaryInput
} from '$lib/server/core/home/types';

export async function summariseInvoicing(input: SummaryInput): Promise<ModuleSummary> {
	const standing = await readiness(input, 'invoicing', {
		statement: 'Invoicing is ready when you are',
		nothingYet: 'Nothing invoiced yet.'
	});

	return standing ? { ...NOTHING_TO_REPORT, standing } : NOTHING_TO_REPORT;
}
