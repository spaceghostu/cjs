/**
 * WHAT THE SHELL NEEDS, ONCE PER NAVIGATION.
 *
 * `handleBusiness` already resolved the tenant, the member and the access map for this
 * request, so nothing here asks the database a second time. The load is a projection: it
 * turns what `locals` knows into what the sidebar and the bottom nav render, and it does the
 * deriving on the SERVER so the nav is right in the first HTML rather than after hydration.
 *
 * `withBusiness` is used rather than reading `locals` directly for the redirect it carries:
 * a signed-out visitor lands on sign-in and a signed-in one with no business lands on
 * onboarding, both from one place, for every route inside the shell at once.
 */
import { withBusiness } from '$lib/server/core/ctx';
import { monthlyTotal } from '$lib/server/core/modules/catalogue';
import { sidebarGroups } from '$lib/components/shell/nav';
import { initialsOf, tenantSubtitle } from '$lib/components/shell/identity';
import type { LayoutServerLoad } from './$types';

/**
 * The date in the top bar, formatted here rather than in the component.
 *
 * A client-side `new Date()` renders one string on the server and possibly another in the
 * browser — a hydration mismatch that appears at midnight, in a different timezone, on
 * somebody else's machine. One string, computed once, crosses the boundary instead.
 */
function formatToday(locale: string, now: Date): string {
	return now.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

export const load: LayoutServerLoad = async (event) => {
	return withBusiness(event, async (ctx) => {
		const name = event.locals.user?.name ?? '';

		return {
			tenant: {
				name: ctx.business.tradingName,
				initials: initialsOf(ctx.business.tradingName),
				subtitle: tenantSubtitle(ctx.member.role, ctx.business.address.city),
				brandColor: ctx.business.brandColor
			},
			person: {
				name,
				initials: initialsOf(name)
			},
			/**
			 * The design is firm that this flag hides the command bar and NOTHING else. It
			 * reaches the shell and stops there — no nav item, no route and no action reads it.
			 */
			aiEnabled: ctx.business.aiEnabled,
			nav: sidebarGroups(ctx.access),
			access: ctx.access,
			/** The same function T11's switcher reads. One sum, two screens. */
			monthlyTotal: monthlyTotal(ctx.access),
			today: formatToday(ctx.business.locale, new Date())
		};
	});
};
