import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
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
import { unhandledRefusal } from '$lib/core/refusals';

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
 *
 * `/q` is on this list for a different reason from the rest of it. It is the shared quote page
 * (T18), and the person reading it is a CLIENT: they have no account, and if they happen to
 * also be a user of this product somewhere else, their own business has nothing to do with the
 * document they were sent. Resolving a tenant for them would be meaningless at best, and at
 * worst would put a business context on a request that is deliberately bounded by a share
 * token instead — see `$lib/server/core/share.ts`.
 */
const PRE_BUSINESS_PATHS = ['/onboarding', '/sign-in', '/sign-out', '/api/auth', '/q'];

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

/**
 * THE THROW NOBODY ANTICIPATED — AND THE ADDRESS THAT NEVER EXISTED, WHICH ARRIVES HERE TOO.
 *
 * Every deliberate refusal in this product goes through `error()` with an `App.Error` written
 * for the person reading it. This hook is for the other kind: a driver that went away
 * mid-transaction, a null nobody guarded, a bug. Without it SvelteKit fills `App.Error` with its
 * own default — the two words "Internal Error" — and a developer's sentence lands on a user's
 * screen, which is the exact prohibition `$lib/core/validation` states as a rule: if a sentence
 * was written for a developer, a developer is who gets to read it.
 *
 * So the cause is LOGGED and the person is TOLD SOMETHING ELSE. The two halves are joined by
 * `locals.requestId`, which exists for precisely this — "correlates a request's log lines and
 * its audit rows" — so the sentence somebody read out over the phone can be found in the log
 * without them having to describe it. The id is read defensively because a failure early enough
 * in the pipeline can precede the hook that sets it.
 *
 * NEVER RETURN THE CAUSE'S OWN MESSAGE. A Postgres constraint name, a stack frame or a zod issue
 * would be both frightening and useless to the person it reached, and on a shared error surface
 * it is also how internals leak.
 *
 * WHAT ARRIVES HERE IS NOT ALL ONE KIND OF THING, and that is why this hook branches rather than
 * answering everything the same way. SvelteKit does not route an unmatched URL to a 404 page: it
 * raises a `SvelteKitError`, and only an `HttpError` — the shape `error()` throws — short-circuits
 * before this hook. So every mistyped address, dead bookmark, bot walking a wordlist and browser
 * asking for a favicon that is not there lands in this function, and it is by a wide margin the
 * most common thing that will ever run through it. Answering those with "Something went wrong on
 * our side" would tell somebody the product had broken when all they did was mistype a URL.
 *
 * The decision is `unhandledRefusal()` in `$lib/core/refusals`, which is pure and asserted in
 * `refusals.test.ts` for the same reason `toneOf` is: this is a rule about what the product says,
 * not a habit of one hook. Below 500 it is the router refusing a request, and it renders calm
 * with a way back; at 500 and above something genuinely broke, and the `unexpected` shape stands.
 *
 * AND THE LOG FOLLOWS THE SAME LINE. A 404 is a routine fact of having a public URL space, not an
 * incident: logging a nine-frame stack for each one would bury the genuine 500s under favicon
 * probes and scanner traffic, which is the failure mode where a log stops being read at all. The
 * refusal is still returned and rendered — nothing is swallowed — it is simply not reported as a
 * fault, because it is not one.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	if (status >= 500) {
		console.error(
			`[${event.locals?.requestId ?? 'no-request-id'}] ${status} ${message} at ${event.url.pathname}`,
			error
		);
	}

	return unhandledRefusal(status);
};

export const handle: Handle = sequence(handleIdentity, handleBusiness, handleGuard);
