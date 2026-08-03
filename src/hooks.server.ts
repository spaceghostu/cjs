import type { Handle, ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { assertDatabaseRoleIsSafe } from '$lib/server/core/db/client';

/**
 * Boot checks. `src/lib/server/env.ts` validates every secret the moment it is imported;
 * this additionally proves the database role cannot bypass Row Level Security, which is
 * the failure that would be invisible in testing and catastrophic in production.
 */
export const init: ServerInit = async () => {
	await assertDatabaseRoleIsSafe();
};

/**
 * Identity only. This resolves WHO the request is, never WHICH BUSINESS or WHAT THEY MAY
 * DO — those are `handleBusiness` and `handleGuard` (M2), which sequence after this one.
 *
 * `svelteKitHandler` must stay the innermost resolver, and `/api/auth/*` must never reach
 * the business or entitlement handlers: at sign-in there is no business yet.
 */
const handleIdentity: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(handleIdentity);
