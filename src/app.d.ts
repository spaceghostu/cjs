import type { User, Session } from 'better-auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** WHO. Set by handleIdentity in hooks.server.ts. */
			user?: User;
			session?: Session;
			// M2 adds:
			//   business?: { id, tradingName, currency, locale, aiEnabled }
			//   member?:   { userId, role: 'owner' | 'staff' }
			//   access:    Record<ModuleKey, 'none' | 'read' | 'write'>
			//   requestId: string
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
