/**
 * Identity.
 *
 * better-auth owns WHO someone is. It does not own WHICH BUSINESS they belong to — that
 * is `core_member`, and it is the single source of truth for the owner/staff role that
 * gates every billing action.
 *
 * We deliberately do NOT install better-auth's `organization` plugin. It would create a
 * second membership table and a second role system alongside `core_member`, and any drift
 * between them lands on the billing gate — someone could be an owner in one system and
 * staff in the other. One membership model, one role, one answer.
 *
 * Identity is also the ONE non-tenant data domain in this database. Its tables live in the
 * `identity` schema, have no `business_id`, and are exempt from the platform invariants —
 * they must be deletable (sign-out deletes sessions, magic-link consumption deletes
 * verifications) and they must be readable before any business context exists, or nobody
 * could ever sign in.
 */
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { magicLink } from 'better-auth/plugins/magic-link';
import { getRequestEvent } from '$app/server';
import { unsafeDb } from '$lib/server/core/db/client';
import * as identity from '$lib/server/core/db/schema/identity';
import { env, features } from '$lib/server/env';
import { sendMail } from '$lib/server/core/mail';

/**
 * WHY THIS IS A FUNCTION AND NOT A CONSTANT
 * -----------------------------------------
 * `betterAuth()` validates its config as it is called, and refuses to be constructed
 * without `BETTER_AUTH_SECRET`. `env.ts` deliberately supplies nothing during `vite build`
 * — "a build must never require production credentials" — and SvelteKit's build-time route
 * analysis IMPORTS every `+page.server.ts`, which transitively imports this module. Built
 * eagerly, the auth instance is therefore constructed once with no secret, and the build
 * dies on a machine that has no business holding one.
 *
 * Deferring construction to the first request fixes it at the cause: analysis imports the
 * module and never calls this, while a real request has a real environment. The instance is
 * memoised, so `$context`, the cookie plugin and the session cache are all shared exactly as
 * they were when this was a constant.
 */
let instance: ReturnType<typeof createAuth> | null = null;

export function auth(): ReturnType<typeof createAuth> {
	instance ??= createAuth();
	return instance;
}

const createAuth = () =>
	betterAuth({
		baseURL: env.ORIGIN,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(unsafeDb, {
			provider: 'pg',
			// Explicit map: these tables live in the `identity` Postgres schema, not `public`.
			schema: {
				user: identity.user,
				session: identity.session,
				account: identity.account,
				verification: identity.verification
			}
		}),

		emailAndPassword: { enabled: true },

		socialProviders: {
			...(features.google && {
				google: {
					clientId: env.GOOGLE_CLIENT_ID!,
					clientSecret: env.GOOGLE_CLIENT_SECRET!
				}
			}),
			...(features.microsoft && {
				microsoft: {
					clientId: env.MICROSOFT_CLIENT_ID!,
					clientSecret: env.MICROSOFT_CLIENT_SECRET!
				}
			})
		},

		session: {
			// This audience uses the product monthly. Being logged out between payroll runs is
			// a papercut that reads as "the software lost my stuff", so sessions are long and
			// refresh on use.
			expiresIn: 60 * 60 * 24 * 60,
			updateAge: 60 * 60 * 24
		},

		plugins: [
			magicLink({
				expiresIn: 60 * 15,
				sendMagicLink: async ({ email, url }) => {
					await sendMail({
						to: email,
						subject: 'Your sign-in link for CJs',
						text:
							`Tap this link to sign in to CJs:\n\n${url}\n\n` +
							`The link works once and expires in 15 minutes.\n` +
							`If you didn't ask to sign in, you can ignore this email — nothing will happen.`
					});
				}
			}),
			// Must remain last.
			sveltekitCookies(getRequestEvent)
		]
	});
