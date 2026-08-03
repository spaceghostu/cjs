/**
 * THE ONLY ROUTE TO THE DATABASE.
 *
 * `db/client.ts` states the access model in one sentence:
 *
 *   > Module code takes a `Ctx` from `withModule(event, key, intent)`; there is no other
 *   > route to the database, and `unsafeDb` is not assignable to the branded `Tx` that
 *   > scoped code requires.
 *
 * This file is that route. It is the ONE module outside `db/` allowed to import the
 * unscoped connection (ESLint zone 1 names it explicitly), and everything it exports has
 * already established three things before module code sees a transaction:
 *
 *   TENANCY      `SET LOCAL cjs.business_id`, so every RLS policy has an answer.
 *   ATTRIBUTION  `SET LOCAL cjs.user_id`, so the audit trigger records who acted.
 *   ENTITLEMENT  the module is owned, to the degree the intent requires.
 *
 * WHY `intent` IS A PARAMETER AND NOT AN INFERENCE
 * -----------------------------------------------
 * The design promises that removing a module leaves its data "read-only and exportable".
 * That is only expressible if the gate is told what the caller is about to do: the same
 * business, the same module and the same user must be refused a write and allowed a read.
 * Inferring it from whether the handler happens to issue an `UPDATE` would be a check that
 * fires after the decision has already been made.
 */
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { runAsUser, runScoped } from './db/client';
import type { Tx } from './db/tx';
import { business as businessTable, member as memberTable } from './db/schema/core';
import { toBusiness, toMember, type Business, type Member } from './db/map';
import {
	NO_ACCESS,
	loadAccess,
	permits,
	refuse,
	type Access,
	type AccessMap,
	type Intent,
	type ModuleKey
} from './entitlement';

export type { Tx } from './db/tx';
export type { Access, AccessMap, Intent, ModuleKey } from './entitlement';

/**
 * What scoped code is handed.
 *
 * `tx` is the branded handle — holding one is proof the session variables are set. The rest
 * is the answer to "who is doing this, for whom" that a module would otherwise re-derive.
 */
export type Ctx = {
	readonly tx: Tx;
	readonly business: Business;
	readonly member: Member;
	readonly userId: string;
	readonly access: AccessMap;
	readonly requestId: string;
};

/** A `Ctx` that also knows which module it is acting for, and under what intent. */
export type ModuleCtx = Ctx & {
	readonly module: ModuleKey;
	readonly intent: Intent;
};

/** The businesses a signed-in person may act for, before one has been chosen. */
export type Membership = {
	businessId: string;
	tradingName: string;
	brandColor: string;
	role: Member['role'];
};

/**
 * "Which businesses is this person in?" — the one query that runs before a tenant exists.
 *
 * Reaches exactly two tables, via the two SELECT-only policies in `0003_platform.sql`. There
 * is no privileged connection here and no SECURITY DEFINER function: the answer is
 * constrained by Row Level Security like everything else, it just keys off the user instead
 * of the business.
 */
export async function loadMemberships(userId: string): Promise<Membership[]> {
	return runAsUser(userId, async (tx) => {
		const rows = await tx
			.select({
				businessId: businessTable.businessId,
				tradingName: businessTable.tradingName,
				brandColor: businessTable.brandColor,
				role: memberTable.role
			})
			.from(memberTable)
			.innerJoin(businessTable, eq(businessTable.businessId, memberTable.businessId))
			.where(eq(memberTable.userId, userId))
			.orderBy(businessTable.tradingName);

		return rows;
	});
}

/**
 * WHICH of a person's businesses this request is acting for.
 *
 * `requested` comes from a cookie, which is to say from the client, which is to say it is a
 * CLAIM and not a fact. This function is where the claim is checked, and it is a separate
 * named function rather than a line inside the hook because it is the whole of "a user who
 * belongs to business A cannot act for business B by editing the request".
 *
 * An unrecognised id is IGNORED, not refused. Refusing would mean a stale cookie — from a
 * business someone left, or one they were removed from — locking them out of the product
 * with an error they cannot act on. Falling back to their own first business is both safe
 * and the thing they wanted.
 */
export function selectMembership(
	memberships: readonly Membership[],
	requested: string | undefined
): Membership | null {
	if (memberships.length === 0) return null;
	return memberships.find((m) => m.businessId === requested) ?? memberships[0];
}

/**
 * Platform work: settings, export, anything that is not a module.
 *
 * Applies tenancy and attribution but no entitlement gate, because there is no module to
 * gate on. Everything a business owns is reachable through it, which is exactly what export
 * needs and exactly why module routes must not use it.
 */
export async function withBusiness<T>(
	event: RequestEvent,
	fn: (ctx: Ctx) => Promise<T>
): Promise<T> {
	const { business, member, requestId } = requireBusiness(event);

	return runScoped(business.id, member.userId, async (tx) => {
		const access = event.locals.access ?? (await loadAccess(tx));
		return fn({ tx, business, member, userId: member.userId, access, requestId });
	});
}

/**
 * Module work. The door named in `db/client.ts`.
 *
 * Refuses before opening a transaction, so a locked module costs a check rather than a
 * connection.
 */
export async function withModule<T>(
	event: RequestEvent,
	moduleKey: ModuleKey,
	intent: Intent,
	fn: (ctx: ModuleCtx) => Promise<T>
): Promise<T> {
	const { business, member, requestId } = requireBusiness(event);

	const access = moduleAccess(event, moduleKey);
	if (!permits(access, intent)) refuse(moduleKey, access);

	return runScoped(business.id, member.userId, async (tx) => {
		const map = event.locals.access ?? (await loadAccess(tx));
		return fn({
			tx,
			business,
			member,
			userId: member.userId,
			access: map,
			requestId,
			module: moduleKey,
			intent
		});
	});
}

/**
 * Ask WITHOUT being refused.
 *
 * For the routes that want to render the design's locked state — a calm panel offering the
 * module — rather than raise a 403. `withModule` is the enforcement; this is the question.
 */
export function moduleAccess(event: RequestEvent, moduleKey: ModuleKey): Access {
	return (event.locals.access ?? NO_ACCESS)[moduleKey];
}

/** True when this member may add or remove modules. The design gates that on ownership. */
export function isBillingAdmin(event: RequestEvent): boolean {
	return event.locals.member?.role === 'owner';
}

/**
 * THE ONLY PATH THAT MINTS A BUSINESS.
 *
 * Onboarding's chicken-and-egg: the `tenant_isolation` policy requires `business_id =
 * app.current_business_id()`, and the business does not exist yet. Rather than exempt the
 * insert — which would mean a table that can be written without a tenant context, and
 * therefore a hole in the floor — the transaction ADOPTS the new id as its context before
 * the first statement. Both the `core_business` row and the owner's `core_member` row then
 * satisfy the same policy every other write does.
 *
 * The id is generated in here and never accepted from a caller. That is what stops this
 * from being a way to act as an existing business: there is no parameter to point at one.
 */
export async function withNewBusiness<T>(
	userId: string,
	fn: (ctx: { tx: Tx; businessId: string; userId: string }) => Promise<T>
): Promise<T> {
	const businessId = randomUUID();
	return runScoped(businessId, userId, (tx) => fn({ tx, businessId, userId }));
}

/**
 * The guard every scoped entry point shares.
 *
 * A request with no resolved business cannot be allowed to proceed with a partial context:
 * `runScoped` would need a business id it does not have, and the tempting shortcut —
 * running without one — is precisely the case that must return zero rows rather than
 * silently succeed. So it is a redirect to onboarding, which is where a signed-in person
 * with no business genuinely needs to go.
 */
function requireBusiness(event: RequestEvent): {
	business: Business;
	member: Member;
	requestId: string;
} {
	if (!event.locals.user) {
		redirect(303, `/sign-in?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}

	const { business, member, requestId } = event.locals;

	if (!business || !member) {
		redirect(303, '/onboarding');
	}

	// `handleBusiness` sets all three together, so this is unreachable in a real request.
	// It exists because the alternative to a loud failure here is a quiet one later, in a
	// transaction with no tenant context.
	if (!requestId) {
		error(500, {
			code: 'no_request_context',
			message: 'Something went wrong on our side. Nothing you did caused this.',
			nextHref: '/',
			nextLabel: 'Back to your dashboard'
		});
	}

	return { business, member, requestId };
}

/** Re-exported so module code has one import for the whole access model. */
export { permits, loadAccess, NO_ACCESS } from './entitlement';
export { toBusiness, toMember };
