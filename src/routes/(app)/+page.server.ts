/**
 * Home. A placeholder inside a real shell — T14 builds the dashboard.
 *
 * The signed-out landing page that used to live at `/` is gone with it. There is no marketing
 * page in the design and the shell needs a tenant to render, so `/` is now the product and a
 * visitor with no session is sent to sign-in by `withBusiness` — which is where they were
 * going anyway.
 */
import { withBusiness } from '$lib/server/core/ctx';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return withBusiness(event, async (ctx) => ({
		tradingName: ctx.business.tradingName
	}));
};
