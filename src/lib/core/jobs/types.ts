/**
 * WHAT A JOB IS, on both sides of the network.
 *
 * Client-safe, like Quoting's, Invoicing's and Inventory's models and for the same reason: the
 * words a screen says about a job and the values the acceptance transaction writes come out of
 * the same list, so the two cannot drift. Nothing here touches the database, `$lib/server`, or
 * the DOM.
 *
 * THE ONE DECISION THIS MODULE IS BUILT AROUND
 * --------------------------------------------
 * A job's `status` answers exactly ONE question — is the physical work happening? — and it is
 * set by a person, never derived from money. Not one of the six values below says anything
 * about what has been quoted, invoiced or paid, and that omission is the whole design.
 *
 * The alternative is the legacy bug SPA-20 was written to kill: a `jobs.status` of `'quoted'`
 * sitting beside a `quotes.status` of `'sent'`, two columns owning the same fact, disagreeing
 * with each other the first time one of them is written and the other is not. Commercial state
 * has exactly one owner in this product — the quotes and invoices themselves — and
 * `./commercial.ts` folds them into an answer at READ time rather than storing a second copy of
 * it. So "paid in full, still in progress" and "done, R2 400 still owed" are both perfectly
 * storable here, because both are things that genuinely happen to a small business.
 *
 * The corollary is that nothing closes a job automatically. Settling every invoice on a job
 * leaves its status exactly where the person left it, because only the person knows whether the
 * work is finished.
 */
/**
 * WHERE THE WORK HAS GOT TO.
 *
 * Six values, and the only thing they describe is the work itself.
 *
 *  - `unscheduled` is where every job starts, including one created the instant a client accepts
 *    a quote. Nobody has put a date on it yet, and pretending otherwise would mean inventing a
 *    date on the client's behalf.
 *  - `scheduled` — a day exists. The schedule table that will hold it is a later ticket; the
 *    status is here now because it is what the pipeline screen groups by.
 *  - `in_progress` — somebody is on site, or the bench work has started.
 *  - `done` — the work is finished. NOT "the money has arrived", which is `./commercial.ts`'s
 *    business and is very often a different day.
 *  - `on_hold` — waiting on a part, on the client, on the weather. Distinct from `unscheduled`,
 *    which has never had a date, and from `cancelled`, which is not coming back.
 *  - `cancelled` — it is not happening. Archiving is a separate act (`archivedAt`): a cancelled
 *    job is still a job somebody wants to see in a list, and an archived one is one they do not.
 *
 * MEMBERSHIP IS CHECKED; ORDERING IS NOT. The database carries a CHECK built from this list, so
 * an unknown status is unstorable — but there is no transition table and no trigger, and a job
 * may go from `done` back to `in_progress` because a business that has to go back out and refit
 * a hinge should not have to argue with its software about it.
 */
export const JOB_STATUSES = [
	'unscheduled',
	'scheduled',
	'in_progress',
	'done',
	'on_hold',
	'cancelled'
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: unknown): value is JobStatus {
	return typeof value === 'string' && (JOB_STATUSES as readonly string[]).includes(value);
}

/**
 * HOW URGENT IT IS.
 *
 * INVENTED, and worth saying so plainly: no source in this ticket, in the design or in the
 * client's own words names a set of priorities. These four are the smallest list that lets a
 * pipeline screen sort by something other than the date, and `normal` is the default precisely
 * so that a business which never touches the field is not implicitly saying anything.
 *
 * Because it is invented, SPA-23 is free to widen it when the pipeline screen is designed and
 * somebody actually looks at it — widening a CHECK built from this list is one migration and no
 * data change. What SPA-23 must not do is start encoding commercial urgency here ("unpaid",
 * "deposit overdue"); that is the same two-owners mistake in a different column.
 */
export const JOB_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type JobPriority = (typeof JOB_PRIORITIES)[number];

export function isJobPriority(value: unknown): value is JobPriority {
	return typeof value === 'string' && (JOB_PRIORITIES as readonly string[]).includes(value);
}

/**
 * A JOB, as the rest of the product sees one.
 *
 * `service`, `area` and `description` are free text and all three are nullable, for the reason
 * `db/schema/inventory.ts` gives about units: a joinery's "kitchen fit" and a plumber's
 * "geyser replacement" are the same field, and any closed list we wrote would be wrong for the
 * third trade on its first day. A job created automatically on quote acceptance has none of
 * them except a description seeded from the quote, and that is an honest empty rather than an
 * invented one.
 *
 * `ref` is the client-facing shape of the number — `JOB-0001`. The database holds it as three
 * columns (prefix, value, formatted) so that sorting and displaying are different questions;
 * this type carries only the answer a screen needs.
 *
 * There is NO money on this type, and no commercial status. That is not an omission — see the
 * file header.
 */
export type Job = {
	readonly id: string;
	readonly businessId: string;
	readonly ref: string;
	readonly customerId: string;
	readonly service: string | null;
	readonly area: string | null;
	readonly description: string | null;
	readonly priority: JobPriority;
	readonly status: JobStatus;
	/** Null on the acceptance path: a client answering an emailed link is not a user. */
	readonly startedByUserId: string | null;
	readonly archivedAt: Date | null;
	readonly createdAt: Date;
};
