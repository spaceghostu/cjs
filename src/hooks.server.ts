import type { Handle, ServerInit } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { assertDatabaseRoleIsSafe, runScoped } from '$lib/server/core/db/client';
import { business as businessTable, member as memberTable } from '$lib/server/core/db/schema/core';
import { toBusiness, toMember } from '$lib/server/core/db/map';
import { loadMemberships, selectMembership } from '$lib/server/core/ctx';
import { loadAccess } from '$lib/server/core/entitlement';

/**
 * Boot checks. `src/lib/server/env.ts` validates every secret the moment it is imported;
 * this additionally proves the database role cannot bypass Row Level Security, which is
 * the failure that would be invisible in testing and catastrophic in production.
 */
export const init: ServerInit = async () => {
	await assertDatabaseRoleIsSafe();
};

/** Which business the top-bar switcher last selected. */
const BUSINESS_COOKIE = 'cjs_business';

/**
 * Routes that must work before a business exists — otherwise a signed-in person with no
 * business is redirected to onboarding by a guard that onboarding itself trips.
 */
const PRE_BUSINESS_PATHS = ['/onboarding', '/sign-in', '/sign-out', '/api/auth'];

function isPreBusiness(pathname: string): boolean {
	return PRE_BUSINESS_PATHS.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

/**
 * Identity only. This resolves WHO the request is, never WHICH BUSINESS or WHAT THEY MAY
 * DO — those are `handleBusiness` and `handleGuard`, which sequence after this one.
 *
 * `svelteKitHandler` must stay the innermost resolver, and `/api/auth/*` must never reach
 * the business or entitlement handlers: at sign-in there is no business yet.
 */
const handleIdentity: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomUUID();

	const session = await auth().api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth: auth(), building });
};

/**
 * WHICH BUSINESS, and WHAT THEY MAY DO.
 *
 * Runs one transaction: the memberships this person has, the business they are acting for,
 * and that business's module access. Everything downstream reads `locals` rather than
 * asking again, so the shell, the nav and the route guard cannot disagree.
 *
 * THE PART THAT IS SECURITY, NOT CONVENIENCE
 * ------------------------------------------
 * The requested business comes from a cookie, which is to say from the client, which is to
 * say it is a claim and not a fact. It is checked against `loadMemberships()` — itself
 * constrained by Row Level Security to rows belonging to this user — and an id that is not
 * in that list is IGNORED rather than honoured. A person who edits the cookie to another
 * business's id lands on their own default business, not on someone else's data.
 */
const handleBusiness: Handle = async ({ event, resolve }) => {
	const user = event.locals.user;
	if (!user || isPreBusiness(event.url.pathname)) return resolve(event);

	const memberships = await loadMemberships(user.id);
	event.locals.memberships = memberships;

	const requested = event.cookies.get(BUSINESS_COOKIE);
	const chosen = selectMembership(memberships, requested);
	if (!chosen) return resolve(event);

	// Rewrite the cookie whenever it was absent, stale or a claim we did not honour, so the
	// next request does not repeat the fallback.
	if (requested !== chosen.businessId) {
		event.cookies.set(BUSINESS_COOKIE, chosen.businessId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !event.url.hostname.match(/^(localhost|127\.0\.0\.1)$/),
			maxAge: 60 * 60 * 24 * 365
		});
	}

	await runScoped(chosen.businessId, user.id, async (tx) => {
		const [businessRow] = await tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, chosen.businessId));
		const [memberRow] = await tx.select().from(memberTable).where(eq(memberTable.userId, user.id));

		// Both rows were just proven to exist by loadMemberships. If they are gone now, the
		// business was removed mid-request — leaving locals unset sends the request to
		// onboarding, which is the correct destination for a person with no business.
		if (!businessRow || !memberRow) return;

		event.locals.business = toBusiness(businessRow);
		event.locals.member = toMember(memberRow);
		event.locals.access = await loadAccess(tx);
	});

	return resolve(event);
};

/**
 * A signed-in person with no business has nowhere to be. Send them to onboarding from
 * every route rather than letting them reach a shell with nothing in it.
 *
 * Signed-OUT visitors are not redirected here: individual routes decide whether they need
 * a session, and `withBusiness`/`withModule` redirect to sign-in when they do. A blanket
 * guard would also catch the sign-in page.
 */
const handleGuard: Handle = async ({ event, resolve }) => {
	const needsBusiness =
		event.locals.user && !event.locals.business && !isPreBusiness(event.url.pathname);

	if (needsBusiness) redirect(303, '/onboarding');

	return resolve(event);
};

export const handle: Handle = sequence(handleIdentity, handleBusiness, handleGuard);
