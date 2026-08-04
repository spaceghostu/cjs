/**
 * DOES THIS BUSINESS OWN THIS MODULE RIGHT NOW?
 *
 * One question, one answer, three states — and the middle one is the whole reason this file
 * is not a boolean.
 *
 * | State       | Meaning             | Behaviour                                          |
 * | ----------- | ------------------- | -------------------------------------------------- |
 * | Owned       | Active period today | Full read and write                                |
 * | Removed     | Had a closed period | READ-ONLY AND EXPORTABLE. The data stays.          |
 * | Never owned | No period ever      | Locked. There is nothing to show.                  |
 *
 * The design is explicit that removing Payroll does not take your payroll data away — "your
 * payroll data stays yours", read-only and exportable. A boolean `owns` collapses *removed*
 * into *never owned*, and getting that back later means reconstructing history nobody kept.
 * Hence a period with a start and an optional end, never a flag.
 *
 * WHAT THIS FILE OWNS
 * -------------------
 * The shape, the arithmetic and the failure mode. The periods themselves come from
 * `billing_subscription` (see `schema/billing.ts`), and the add/remove/undo that opens and
 * closes them lives in `modules/subscribe.ts` — this file only ever reads.
 *
 * The keys themselves moved to `$lib/core/modules/catalogue` when the shell landed: the
 * sidebar and the bottom nav are client components and cannot import `$lib/server`, so a
 * key list that lived only here would have had to be restated for them. They are re-exported
 * below, so `import { ModuleKey } from '$lib/server/core/entitlement'` still reads the way
 * a route wants it to — entitlement is what every route asks about.
 */
import { error } from '@sveltejs/kit';
import { isNull } from 'drizzle-orm';
import type { Tx } from './db/tx';
import { subscription } from './db/schema/billing';
import {
	MODULE_KEYS,
	NO_ACCESS,
	isModuleKey,
	label,
	type Access,
	type AccessMap,
	type ModuleKey
} from '$lib/core/modules/catalogue';

/**
 * `none` is locked, `read` is a removed module's archive, `write` is owned — defined in the
 * catalogue so the shell can render the three states, re-exported here because entitlement
 * is what every route asks about.
 */
export { MODULE_KEYS, NO_ACCESS, isModuleKey, label };
export type { Access, AccessMap, ModuleKey };

/** What a caller is about to do. The reason `read` and `write` are gated differently. */
export type Intent = 'read' | 'write';

/**
 * One stretch of time a business owned a module.
 *
 * Re-adding a removed module opens a NEW period rather than reopening the old one, so the
 * history reads as what actually happened and proration in T12 has real dates to work from.
 */
export type SubscriptionPeriod = {
	moduleKey: ModuleKey;
	startedAt: Date;
	/** Null while the module is still owned. */
	endedAt: Date | null;
};

/**
 * Periods -> access, as of a moment.
 *
 * Pure, so the three states can be tested exhaustively without a database. `now` is a
 * parameter rather than a call to `Date.now()` for the same reason: a period boundary is
 * exactly where this is worth testing, and a function that reads the clock cannot be asked
 * about one.
 */
export function accessFromPeriods(
	periods: readonly SubscriptionPeriod[],
	now: Date = new Date()
): AccessMap {
	const access: Record<ModuleKey, Access> = { ...NO_ACCESS };

	for (const period of periods) {
		// A period that has not started yet grants nothing — not even the archive. Scheduling
		// a module for next month must not unlock it today.
		if (period.startedAt.getTime() > now.getTime()) continue;

		const active = period.endedAt === null || period.endedAt.getTime() > now.getTime();
		if (active) {
			access[period.moduleKey] = 'write';
		} else if (access[period.moduleKey] === 'none') {
			// Closed period: the archive stays readable. Never downgrade an active module
			// because an older closed period also exists.
			access[period.moduleKey] = 'read';
		}
	}

	return Object.freeze(access);
}

/**
 * The gate itself.
 *
 * `read` succeeds on a removed module, which is what makes "read-only and exportable" true.
 * `write` requires an active subscription, which is what stops a business editing a module
 * it is no longer paying for.
 */
export function permits(access: Access, intent: Intent): boolean {
	return intent === 'write' ? access === 'write' : access !== 'none';
}

/**
 * The refusal.
 *
 * Every message here is written for an anxious non-accountant who has just been stopped
 * from doing something, and every one carries a way forward — the design's locked state is
 * calm and offers the module, and a refusal without a next step is a dead end.
 *
 * Throws a SvelteKit error rather than returning a result because a route that forgets to
 * check must fail closed. `moduleAccess()` in `ctx.ts` is there for the routes that want to
 * RENDER the locked state instead of raising it.
 *
 * Takes no `intent`: by the time a refusal is warranted, `access` alone determines which of
 * the two things happened. `none` is "you have never had this"; `read` can only have been
 * refused for a write, because `permits` allows every read it covers.
 */
export function refuse(moduleKey: ModuleKey, access: Access): never {
	if (access === 'none') {
		error(403, {
			code: 'module_locked',
			message: `Your business hasn't added ${label(moduleKey)} yet. You can add it any time, and only pay for the days you have it.`,
			nextHref: '/settings/modules',
			nextLabel: `Add ${label(moduleKey)}`
		});
	}

	// access === 'read', which permits() only ever refuses for a write.
	error(403, {
		code: 'module_removed',
		message: `${label(moduleKey)} was removed from your business, so it can't be changed. Everything already in it stays yours to read and export.`,
		nextHref: '/settings/modules',
		nextLabel: `Add ${label(moduleKey)} back`
	});
}

/**
 * The access map for the business this transaction is scoped to.
 *
 * No `businessId` parameter: the periods come from a tenant table, so RLS has already
 * decided whose they are. Passing an id would create a second, weaker answer to a question
 * the database has already answered.
 */
export async function loadAccess(tx: Tx, now: Date = new Date()): Promise<AccessMap> {
	return accessFromPeriods(await loadSubscriptionPeriods(tx), now);
}

/**
 * The periods, from `billing_subscription`.
 *
 * No `where business_id = …`: the table is a tenant table, so `tenant_isolation` has already
 * decided whose rows these are. Adding a predicate would be a second, weaker answer to a
 * question the database has answered — and one that could drift.
 *
 * VOIDED PERIODS ARE EXCLUDED. Undo (T13) marks a period as never having counted rather than
 * closing it, precisely so that it does not land here as a closed period and hand somebody a
 * read-only archive of a module they had for four seconds. See `schema/billing.ts`.
 */
async function loadSubscriptionPeriods(tx: Tx): Promise<SubscriptionPeriod[]> {
	const rows = await tx
		.select({
			moduleKey: subscription.moduleKey,
			startedAt: subscription.startedAt,
			endedAt: subscription.endedAt
		})
		.from(subscription)
		.where(isNull(subscription.voidedAt))
		.orderBy(subscription.startedAt);

	// A key the catalogue no longer knows is skipped rather than thrown on. The CHECK
	// constraint makes it near-impossible, and a retired module must not be able to take
	// somebody's whole dashboard down on the way out.
	return rows.filter((row) => isModuleKey(row.moduleKey)) as SubscriptionPeriod[];
}
