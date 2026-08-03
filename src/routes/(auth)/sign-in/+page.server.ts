/**
 * STUB AWAITING DESIGN (T06).
 *
 * Functional, built from T01 tokens and T02 primitives, not designed. The Claude Design
 * project does not cover sign-in.
 *
 * THE ONE THING THIS SCREEN MUST NOT DO
 * ------------------------------------
 * Claim a magic link was sent when it was not. `mail.ts` has a decided behaviour — printed
 * to the console in development, REFUSED in production when SMTP is unconfigured, never
 * silently dropped — and a "check your email" over the top of a refusal is the single
 * worst thing an auth screen can say: the person waits, then waits longer, then assumes
 * the product is broken. Every path below reports what actually happened.
 */
import { dev } from '$app/environment';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import { z } from 'zod';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { features } from '$lib/server/env';
import type { PageServerLoad } from './$types';

const emailSchema = z.email('Enter an email address like you@yourbusiness.co.za');

const credentials = z.object({
	email: emailSchema,
	password: z.string().min(8, 'Passwords are at least 8 characters')
});

const registration = credentials.extend({
	name: z.string().trim().min(1, 'Tell us what to call you')
});

export const load: PageServerLoad = async ({ locals, url }) => {
	// Already signed in: nothing to do here. The business guard in hooks.server.ts decides
	// whether that means the dashboard or onboarding.
	if (locals.user) redirect(303, url.searchParams.get('next') ?? '/');

	return {
		// `env.ts` exposes these so a provider with no credentials never renders a dead
		// button. A button that does nothing is worse than an absent one — it reads as the
		// product being broken rather than the option being unavailable.
		providers: { google: features.google, microsoft: features.microsoft },
		mailConfigured: features.mail,
		dev
	};
};

/** better-auth reports bad credentials as an APIError; anything else is ours to own. */
function describe(error: unknown, fallback: string): string {
	if (error instanceof APIError) {
		return error.body?.message ?? fallback;
	}
	return fallback;
}

const nextFrom = (url: URL) => url.searchParams.get('next') ?? '/';

export const actions: Actions = {
	/**
	 * The primary path. No password to choose, none to forget.
	 */
	magic: async ({ request, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');

		const parsed = emailSchema.safeParse(email);
		if (!parsed.success) {
			return fail(400, { email, magic: parsed.error.issues[0].message });
		}

		try {
			await auth().api.signInMagicLink({
				body: { email: parsed.data, callbackURL: nextFrom(url) },
				headers: request.headers
			});
		} catch (error) {
			// The production-with-no-SMTP case reaches here from `sendMail`, which throws
			// rather than dropping the message. Say so.
			return fail(500, {
				email,
				magic: describe(
					error,
					'We could not send that link. Email is not set up on this server yet — please use a password to sign in, or ask whoever runs this installation to configure it.'
				)
			});
		}

		return {
			email,
			sent: true,
			// In development nothing was actually delivered. Claiming otherwise would send
			// the developer to an inbox that will never receive anything.
			console: dev && !features.mail
		};
	},

	password: async ({ request, url }) => {
		const form = await request.formData();
		const values = Object.fromEntries(form) as Record<string, string>;

		const parsed = credentials.safeParse(values);
		if (!parsed.success) {
			return fail(400, { email: values.email, password: parsed.error.issues[0].message });
		}

		try {
			await auth().api.signInEmail({ body: parsed.data, headers: request.headers });
		} catch (error) {
			return fail(400, {
				email: values.email,
				password: describe(error, 'That email and password do not match an account.')
			});
		}

		redirect(303, nextFrom(url));
	},

	register: async ({ request, url }) => {
		const form = await request.formData();
		const values = Object.fromEntries(form) as Record<string, string>;

		const parsed = registration.safeParse(values);
		if (!parsed.success) {
			return fail(400, {
				email: values.email,
				name: values.name,
				register: parsed.error.issues[0].message
			});
		}

		try {
			await auth().api.signUpEmail({ body: parsed.data, headers: request.headers });
		} catch (error) {
			return fail(400, {
				email: values.email,
				name: values.name,
				register: describe(error, 'We could not create that account.')
			});
		}

		// A brand new account has no business, so the guard sends them to onboarding.
		redirect(303, nextFrom(url));
	},

	social: async ({ request, url }) => {
		const form = await request.formData();
		const provider = String(form.get('provider') ?? '');

		// Only what `env.ts` says is configured. An unconfigured provider must not be
		// reachable by posting the form by hand either.
		const allowed = [features.google && 'google', features.microsoft && 'microsoft'].filter(
			Boolean
		) as string[];

		if (!allowed.includes(provider)) {
			return fail(400, { social: 'That sign-in method is not available on this server.' });
		}

		const { url: target } = await auth().api.signInSocial({
			body: { provider, callbackURL: nextFrom(url) },
			headers: request.headers
		});

		if (!target) {
			return fail(500, { social: 'We could not start that sign-in. Please try again.' });
		}

		redirect(303, target);
	}
};
