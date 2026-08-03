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
 * WHAT THIS FILE OWNS, AND WHAT T10 ADDS
 * --------------------------------------
 * The shape, the arithmetic and the failure mode are here and fully tested. The DATA — the
 * catalogue, prices, and the `billing_subscription` rows that produce the periods — is T10.
 * `loadSubscriptionPeriods` below is the single seam where that lands.
 *
 * The keys themselves moved to `$lib/core/modules/catalogue` when the shell landed: the
 * sidebar and the bottom nav are client components and cannot import `$lib/server`, so a
 * key list that lived only here would have had to be restated for them. They are re-exported
 * below, so `import { ModuleKey } from '$lib/server/core/entitlement'` still reads the way
 * a route wants it to — entitlement is what every route asks about.
 */
import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Tx } from './db/tx';
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
 * THE SEAM FOR T10.
 *
 * When `billing_subscription` exists this becomes a `select module_key, started_at, ended_at
 * from billing_subscription order by started_at` and nothing else in this file changes.
 *
 * Until then it returns no periods, and no periods is the honest answer rather than a stub:
 * no module has been built, so every module route is correctly the locked state. The query
 * is written out below rather than described, so the change is a deletion.
 */
async function loadSubscriptionPeriods(tx: Tx): Promise<SubscriptionPeriod[]> {
	const hasTable = await tableExists(tx, 'billing_subscription');
	if (!hasTable) return [];

	const { rows } = await tx.execute<{
		module_key: string;
		started_at: Date;
		ended_at: Date | null;
	}>(sql`
		select module_key, started_at, ended_at
		  from billing_subscription
		 order by started_at
	`);

	return rows
		.filter((row) => isModuleKey(row.module_key))
		.map((row) => ({
			moduleKey: row.module_key as ModuleKey,
			startedAt: row.started_at,
			endedAt: row.ended_at
		}));
}

/**
 * Asked once per process, not once per request.
 *
 * The alternative to this check is `entitlement.ts` throwing "relation does not exist" on
 * every request until T10 lands, which would make the floor untestable in the meantime.
 * T10 deletes both this function and its call.
 */
let billingTablePresent: boolean | null = null;

async function tableExists(tx: Tx, name: string): Promise<boolean> {
	if (billingTablePresent !== null) return billingTablePresent;
	const { rows } = await tx.execute<{ present: boolean }>(sql`
		select to_regclass(${`public.${name}`}) is not null as present
	`);
	billingTablePresent = rows[0]?.present ?? false;
	return billingTablePresent;
}
