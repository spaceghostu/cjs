/**
 * WHAT THIS BUSINESS HAS, AND WHAT IT COSTS.
 *
 * The sidebar footer, the mobile More sheet and every entitlement refusal in the product
 * point here — `refuse()` in `entitlement.ts` names this route as the way forward from a
 * locked module — so it has to exist before the switcher does, or the calm offer at the end
 * of a refusal is a 404.
 *
 * WHAT IT IS NOT
 * --------------
 * The switcher (T11) or the add/remove confirmation with its proration (T12). This is the
 * list, honestly priced, with the same total the sidebar shows. Adding and removing needs
 * `billing_subscription` (T10), and a button that pretended to work would be worse than the
 * sentence saying it does not yet.
 */
import { withBusiness } from '$lib/server/core/ctx';
import { monthlyTotal, purchasableModules } from '$lib/server/core/modules/catalogue';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return withBusiness(event, async (ctx) => ({
		modules: purchasableModules().map((m) => ({ ...m, access: ctx.access[m.key] })),
		monthlyTotal: monthlyTotal(ctx.access),
		/** The design gates module changes on "Owners and billing admins only". */
		isOwner: ctx.member.role === 'owner'
	}));
};
