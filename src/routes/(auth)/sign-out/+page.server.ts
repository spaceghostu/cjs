/**
 * STUB AWAITING DESIGN (T06).
 *
 * A POST, not a link. A GET that ends a session can be triggered by a prefetch, an image
 * tag on another site, or an over-eager link scanner — and being signed out mid-quote by
 * something you did not do reads as the product losing your work.
 */
import { redirect, type Actions } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

/** Nothing to look at. Reaching this by URL just goes home. */
export const load: PageServerLoad = async () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		await auth().api.signOut({ headers: request.headers });

		// The business choice is not a secret, but it is stale the moment the session ends,
		// and leaving it behind would preselect a business for whoever signs in next on a
		// shared machine.
		cookies.delete('cjs_business', { path: '/' });

		redirect(303, '/sign-in');
	}
};
