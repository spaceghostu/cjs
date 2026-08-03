import type { User, Session } from 'better-auth';
import type { Business, Member } from '$lib/server/core/db/map';
import type { AccessMap } from '$lib/server/core/entitlement';
import type { Membership } from '$lib/server/core/ctx';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** WHO. Set by handleIdentity in hooks.server.ts. */
			user?: User;
			session?: Session;

			/**
			 * WHICH BUSINESS this request is acting for, and what this person may do in it.
			 * Set by handleBusiness, which resolves them together — a `business` without a
			 * `member` would be a request acting for a tenant nobody has been shown to
			 * belong to, so they are never set independently.
			 */
			business?: Business;
			member?: Member;

			/** Every business this person may act for. Drives the switcher in the top bar. */
			memberships?: Membership[];

			/**
			 * WHAT THEY MAY DO, per module. Resolved once per request so the shell, the nav
			 * and the route guard all read the same answer.
			 */
			access?: AccessMap;

			/** Correlates a request's log lines and its audit rows. */
			requestId?: string;
		}

		/**
		 * Every error the user can see carries a machine code AND language they can act on.
		 * `message` is shown verbatim, so it is written for an anxious non-accountant —
		 * never a stack trace, never jargon, never a dead end.
		 */
		interface Error {
			code?: string;
			message: string;
			/** Where to go instead. A refusal without a next step is a dead end. */
			nextHref?: string;
			nextLabel?: string;
		}
	}
}

export {};
