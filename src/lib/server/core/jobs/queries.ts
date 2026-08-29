/**
 * READING JOBS, AND ASSEMBLING WHAT THEY ARE WORTH.
 *
 * Every function here takes a `Tx` and no `businessId`. That is not an omission: `core_job` is a
 * tenant table, so `tenant_isolation` has already decided whose rows these are, and a
 * `where business_id = …` on top of it would be a second, weaker answer to a question the
 * database has answered. `modules/invoicing/queries.ts` opens with the same paragraph.
 *
 * THE ASSEMBLER CROSSES TWO MODULE BOUNDARIES, THROUGH THEIR FRONT DOORS
 * ---------------------------------------------------------------------
 * `jobCommercialState` needs Quoting's quotes and Invoicing's invoices, and it reaches both only
 * through their `public.ts` — never through their queries. That is the boundary this codebase
 * keeps everywhere, and it is worth saying out loud here that keeping it is a CONVENTION upheld
 * by review and by this comment: the ESLint zone that was meant to enforce it does not currently
 * fire on files under `server/core/` (see the commit that added this file). `home/registry.ts`
 * keeps the same convention voluntarily and for the same reason.
 *
 * And it asks each module only if the business OWNS it, at `write`. `home/registry.ts` gives the
 * argument: a REMOVED module is still readable and exportable — that is what the middle access
 * state is for — but it is not part of the business any more, and reporting from it would
 * quietly undo a removal somebody deliberately made. What comes back instead is `untracked`,
 * naming the module, which is a true answer where "no quotes" would be a confident wrong one.
 */
import { and, desc, eq, isNull, inArray } from 'drizzle-orm';
import { commercialState, type CommercialState, type Job, type JobStatus } from '$lib/core/jobs';
import { todayIn } from '$lib/core/calendar';
import type { AccessMap, ModuleKey } from '$lib/core/modules/catalogue';
import { quotesForJob } from '$lib/server/modules/quoting/public';
import { invoicesForJob } from '$lib/server/modules/invoicing/public';
import { job } from '../db/schema/jobs';
import { toJob } from '../db/map';
import type { Tx } from '../db/tx';

/**
 * One job, or null.
 *
 * Null covers three different situations on purpose — no such job, another tenant's job, and an
 * archived one — because from the caller's side they are the same answer: there is nothing here
 * to show you. Which of the three it was is a question only the database can answer, and
 * answering it out loud would be the beginning of a way to probe for other tenants' ids.
 */
export async function loadJob(tx: Tx, jobId: string): Promise<Job | null> {
	const [row] = await tx
		.select()
		.from(job)
		.where(and(eq(job.id, jobId), isNull(job.archivedAt)))
		.limit(1);

	return row ? toJob(row) : null;
}

/**
 * A row in the jobs list.
 *
 * Not a `Job` and deliberately not a commercial state either: a list of fifty jobs would be
 * fifty pairs of module queries, which is the N+1 the review checklist names. SPA-23's pipeline
 * screen will decide what it can afford to show per row; this is the shape that costs one query.
 */
export type JobListItem = {
	readonly id: string;
	readonly ref: string;
	readonly status: JobStatus;
	readonly customerId: string;
	readonly service: string | null;
	readonly area: string | null;
	readonly createdAt: Date;
};

export async function listJobs(
	tx: Tx,
	options: { statuses?: readonly JobStatus[]; limit?: number } = {}
): Promise<readonly JobListItem[]> {
	const { statuses, limit = 100 } = options;

	const rows = await tx
		.select({
			id: job.id,
			ref: job.numberFormatted,
			status: job.status,
			customerId: job.customerId,
			service: job.service,
			area: job.area,
			createdAt: job.createdAt
		})
		.from(job)
		.where(
			statuses && statuses.length > 0
				? and(isNull(job.archivedAt), inArray(job.status, [...statuses]))
				: isNull(job.archivedAt)
		)
		.orderBy(desc(job.createdAt))
		.limit(limit);

	return rows.map((row) => ({ ...row, status: row.status as JobStatus }));
}

/**
 * WHERE THIS JOB STANDS COMMERCIALLY.
 *
 * The job is loaded FIRST, and a missing one answers `null` rather than a confident `no_quote`.
 * An id the tenant cannot see must read as "there is no such job" — answering "nothing has been
 * quoted for it" would be asserting something about a row we were not allowed to look at.
 *
 * Everything after that is a fold: two batched queries, each gated on ownership, handed to the
 * pure `commercialState` in `$lib/core/jobs`. Nothing is stored, and nothing here decides
 * anything — the precedence rules live in one place, next to their tests.
 */
export async function jobCommercialState(
	tx: Tx,
	access: AccessMap,
	jobId: string,
	now: Date = new Date()
): Promise<CommercialState | null> {
	const found = await loadJob(tx, jobId);
	if (!found) return null;

	const asksQuoting = access.quoting === 'write';
	const asksInvoicing = access.invoicing === 'write';

	const quotes = asksQuoting ? await quotesForJob(tx, jobId) : [];
	const invoices = asksInvoicing ? await invoicesForJob(tx, jobId) : [];

	const missing: readonly ModuleKey[] = [
		...(asksQuoting ? [] : (['quoting'] as const)),
		...(asksInvoicing ? [] : (['invoicing'] as const))
	];

	return commercialState({ quotes, invoices, missing, today: todayIn(now) });
}
