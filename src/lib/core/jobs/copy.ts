/**
 * THE WORDS THE JOBS SCREENS SAY.
 *
 * Kept out of `commercial.ts` for the reason `$lib/core/invoicing/copy.ts` and
 * `$lib/core/inventory/copy.ts` are kept out of their engines: the derivation is a decision about
 * facts, and the sentence is a decision about a person. They change for different reasons and at
 * different moments — SPA-23 will rewrite half these sentences when the pipeline screen is
 * designed, and none of the logic beside them.
 *
 * TWO RULES CARRY OVER FROM EVERY OTHER COPY FILE IN THIS CODEBASE
 * ---------------------------------------------------------------
 *  1. THE COPY IS PLAIN. "Quote lapsed", not `EXPIRED`. A union member leaking onto a screen is
 *     the fastest way a product stops sounding like a person wrote it.
 *
 *  2. AN ABSENCE IS STATED, NEVER HIDDEN. "Awaiting quote" is a real thing to say about a job
 *     somebody accepted over the phone; leaving the line blank would make the screen look broken
 *     rather than make the job look un-quoted.
 *
 * `commercialSentence` is an EXHAUSTIVE switch with no `default` — the same device
 * `storedStatusesFor` uses in `modules/invoicing/queries.ts`. A ninth member of `CommercialState`
 * is then a `bun run check` failure here rather than a job that silently says nothing.
 */
import { formatZar } from '$lib/core/money';
import { label, type ModuleKey } from '$lib/core/modules/catalogue';
import type { CommercialState } from './commercial';
import type { JobStatus } from './types';

/**
 * One line about where the money on this job has got to.
 *
 * The amount appears only in the two states that HAVE one. That is the payoff of the union
 * being discriminated: there is no branch here that could print `R0,00` for a job nobody has
 * invoiced, which is the lie `Blank.svelte` exists to argue against.
 */
export function commercialSentence(state: CommercialState): string {
	switch (state.kind) {
		case 'no_quote':
			return 'Awaiting quote';
		case 'quoted':
			return 'Quote sent';
		case 'declined':
			return 'Quote turned down';
		case 'expired':
			return 'Quote lapsed';
		case 'accepted':
			// "Quote accepted", and deliberately NOT "Accepted, not yet scheduled" — which is
			// what the ticket's example list says and what this line said first. Scheduling is
			// `job.status`, and `commercialState` is never shown it: a job whose quote was
			// accepted and whose owner has since set it to `in_progress` is an ordinary state,
			// and the longer sentence would have rendered "Accepted, not yet scheduled" beside
			// `statusLabel` saying "Under way". Two owners for one fact, disagreeing on a
			// screen, is the exact legacy defect SPA-20 exists to remove; a sentence that
			// reintroduces it in words is no better than a column that reintroduces it in data.
			// Each half is said by whoever knows it, and the screen puts them side by side.
			return 'Quote accepted';
		case 'invoiced':
			return `Invoiced · ${formatZar(state.outstanding)} still owed`;
		case 'settled':
			return 'Paid in full';
		case 'untracked':
			return untrackedSentence(state.missing);
	}
}

/**
 * "Not tracked here — Invoicing isn't part of this business."
 *
 * Names the module rather than saying "some information is missing", because the person reading
 * it is the person who removed the module and the sentence is the reminder of why the figure is
 * absent. The names come from the catalogue so that renaming a module in one place renames it
 * here too.
 */
function untrackedSentence(missing: readonly ModuleKey[]): string {
	const names = missing.map(label);
	if (names.length === 0) return 'Not tracked here';
	const listed =
		names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
	const verb = names.length === 1 ? "isn't" : "aren't";
	return `Not tracked here — ${listed} ${verb} part of this business`;
}

/**
 * The word for a job's own status.
 *
 * "Under way" rather than "In progress" because it is what somebody says out loud, and "Not
 * scheduled" rather than "Unscheduled" for the same reason. None of these six mentions money —
 * see `types.ts` for why that is the point rather than an oversight.
 */
export function statusLabel(status: JobStatus): string {
	switch (status) {
		case 'unscheduled':
			return 'Not scheduled';
		case 'scheduled':
			return 'Scheduled';
		case 'in_progress':
			return 'Under way';
		case 'done':
			return 'Done';
		case 'on_hold':
			return 'On hold';
		case 'cancelled':
			return 'Cancelled';
	}
}
