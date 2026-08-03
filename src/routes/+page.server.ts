/**
 * The placeholder landing page. T07 replaces it with the app shell, T14 with the dashboard.
 *
 * Deliberately does NOT call `withBusiness` — it must render for a signed-out visitor, and
 * `withBusiness` would redirect them to sign-in. Everything it needs is already on `locals`.
 */
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		business: locals.business ? { tradingName: locals.business.tradingName } : null
	};
};
