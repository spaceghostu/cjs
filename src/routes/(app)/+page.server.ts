/**
 * HOME.
 *
 * The one screen that reads from every module at once, which is why almost nothing of it is
 * here: `$lib/server/core/home` owns the fan-out, the composition and the streaming, and this
 * file is the door onto it.
 *
 * `loadHome` is called INSIDE `withBusiness` and its result is returned without awaiting the
 * panels. Two things follow from that and both are deliberate:
 *
 *   - The guard runs first. A signed-out visitor is redirected to sign-in and a signed-in one
 *     with no business to onboarding, before any panel is scheduled.
 *   - The transaction this load opens is NOT the one the panels use. It is committed as soon
 *     as `loadHome` returns; every contributor opens its own short scoped transaction. See the
 *     note at the top of `home/load.ts`.
 *
 * The signed-out landing page that used to live at `/` is gone. There is no marketing page in
 * the design and the shell needs a tenant to render, so `/` is the product and a visitor with
 * no session is sent where they were going anyway.
 */
import { withBusiness } from '$lib/server/core/ctx';
import { loadHome } from '$lib/server/core/home';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// One clock reading for the greeting, the agenda and the renewal row. Three `new Date()`
	// calls in one page load can straddle midnight — see `home/types.ts`.
	const now = new Date();

	return withBusiness(event, async (ctx) => loadHome(event, ctx, now));
};
