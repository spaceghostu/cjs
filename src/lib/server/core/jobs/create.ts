/**
 * CREATING A JOB.
 *
 * One function, because the number and the row have to commit together. `numbering.ts` states
 * the rule: `allocateDocumentNumber` takes a row lock held until the caller's transaction ends,
 * so allocating in one call and inserting in another would leave a window in which `JOB-0001`
 * exists and the job it belongs to does not.
 *
 * WHERE THE `businessId` MUST COME FROM
 * -------------------------------------
 * It is a required input rather than something read from the transaction, because
 * `businessId()` is `uuid NOT NULL` with no database default and every insert in this codebase
 * supplies it explicitly. And it carries `share.ts`'s rule unchanged: on the acceptance path the
 * business id must have come from a row the SHARE TOKEN admitted, never from a request. The one
 * caller that runs without a signed-in user — `modules/quoting/accept.ts` — passes the id off
 * the quote row the token resolved, immediately after resolving it.
 *
 * Getting that wrong is not a subtle failure. A missing business id is a NOT NULL violation
 * inside `actAsSharedTenant`, which aborts the whole acceptance transaction — on the product's
 * only unauthenticated write path, at the moment a client is trying to say yes.
 */
import { z } from 'zod';
import { check } from '$lib/core/validation';
import { JOB_PRIORITIES, type Job, type JobPriority } from '$lib/core/jobs';
import { allocateDocumentNumber } from '../db/numbering';
import { job } from '../db/schema/jobs';
import { toJob } from '../db/map';
import type { Tx } from '../db/tx';

export type CreateJobInput = {
	/** From a row the caller already resolved — a session's business, or a share token's. */
	readonly businessId: string;
	readonly customerId: string;
	readonly service?: string | null;
	readonly area?: string | null;
	readonly description?: string | null;
	readonly priority?: JobPriority;
	/** Null wherever there genuinely is no user. See `share.ts`. */
	readonly startedByUserId?: string | null;
};

/**
 * The shape, asserted rather than assumed.
 *
 * Nothing a person types reaches here — the fields come from rows this codebase already
 * resolved — so this is not the user-input boundary that each module's `wire.ts` guards. It is the
 * guard against a PROGRAMMING error on the one path where the caller has no session to fall
 * back on, and where a NOT NULL violation would surface as a client's acceptance failing for
 * reasons nobody could read. `check` comes from the validation BARREL; importing
 * `$lib/core/validation/zod` directly is the one import restriction ESLint genuinely enforces.
 */
const SHAPE = z.object({
	businessId: z.uuid(),
	customerId: z.uuid(),
	priority: z.enum(JOB_PRIORITIES).optional()
});

/**
 * Allocate the number, insert the row, return the job.
 *
 * `status` is left to the column default `'unscheduled'` rather than passed: a new job has not
 * been scheduled, and saying so in two places would be two places to disagree.
 */
export async function createJob(tx: Tx, input: CreateJobInput): Promise<Job> {
	const shape = check(SHAPE, {
		businessId: input.businessId,
		customerId: input.customerId,
		priority: input.priority
	});

	if (!shape.ok) {
		// Not a message for anybody's screen — see the note above. The refusals in
		// `$lib/core/validation` are for people; this is for whoever reads the log.
		throw new Error(
			`createJob was called with an input it cannot use: ${shape.problems[0]?.field}`
		);
	}

	const number = await allocateDocumentNumber(tx, 'job');

	const [row] = await tx
		.insert(job)
		.values({
			businessId: input.businessId,
			customerId: input.customerId,
			numberPrefix: number.prefix,
			numberValue: number.value,
			numberFormatted: number.formatted,
			service: input.service ?? null,
			area: input.area ?? null,
			description: input.description ?? null,
			priority: input.priority ?? 'normal',
			startedByUserId: input.startedByUserId ?? null
		})
		.returning();

	return toJob(row);
}
