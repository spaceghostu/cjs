/**
 * WHAT THIS BUSINESS HAS, WHAT IT COSTS, AND THE THREE WRITES THAT CHANGE IT.
 *
 * The sidebar footer, the mobile More sheet and every entitlement refusal in the product
 * point here — `refuse()` in `entitlement.ts` names this route as the way forward from a
 * locked module — so it is both the switcher's home and the durable page somebody can
 * bookmark, land on with JavaScript off, and still see the truth on.
 *
 * WHY THE ACTIONS LIVE HERE AND NOT ON AN API ROUTE
 * ------------------------------------------------
 * Every add and remove in the product posts to these three actions, from wherever the dialog
 * happens to be mounted. Form actions carry SvelteKit's CSRF origin check for free, they
 * degrade to an ordinary form post without JavaScript, and they return through `use:enhance`
 * with the page data already reloaded — so the sidebar total and the switcher agree the
 * moment the write lands, without a second round trip that could disagree.
 *
 * `withBusiness`, not `withModule`: changing what you own is platform work, and gating it on
 * owning the thing you are trying to buy would be a circular check.
 */
import { fail } from '@sveltejs/kit';
import { withBusiness } from '$lib/server/core/ctx';
import { CATEGORY_LABELS, isModuleKey, label, type ModuleKey } from '$lib/core/modules/catalogue';
import { loadModulesView } from '$lib/server/core/modules/offers';
import { carryoverSummary, loadCarryover } from '$lib/server/core/modules/carryover';
import { addModule, removeModule, undoAddition } from '$lib/server/core/modules/subscribe';
import { moduleRow } from '$lib/server/core/modules/catalogue';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return withBusiness(event, async (ctx) =>
		// One clock reading for the whole page: the proration, the next-charge date and the
		// "added today" test all describe the same instant.
		loadModulesView(ctx.tx, ctx.business, ctx.access, ctx.member.role === 'owner', new Date())
	);
};

/**
 * The module key a form posted, narrowed.
 *
 * `isModuleKey` is the boundary. Everything downstream — the price lookup, the CHECK
 * constraint, the entitlement map — is keyed on a closed union, and a string that arrived
 * from a form is not one until this has run.
 */
function moduleFrom(data: FormData): ModuleKey | null {
	const value = data.get('module');
	return typeof value === 'string' && isModuleKey(value) ? value : null;
}

export const actions: Actions = {
	/**
	 * ADD. Returns what the toast needs — the id to undo, and what actually came across.
	 *
	 * The carryover is read AFTER the insert, deliberately: "4 people came across" is a claim
	 * about the state the module arrived into, and reading it before would describe a business
	 * that no longer exists by the time the sentence is shown.
	 */
	add: async (event) => {
		return withBusiness(event, async (ctx) => {
			const moduleKey = moduleFrom(await event.request.formData());
			if (!moduleKey) {
				return fail(400, { message: "That isn't a module we know about." });
			}

			const result = await addModule(ctx, moduleKey, new Date());
			const carryover = await loadCarryover(ctx.tx, ctx.business, ctx.access);
			const row = moduleRow(moduleKey);

			return {
				added: {
					subscriptionId: result.subscriptionId,
					moduleKey,
					label: label(moduleKey),
					/** Where it lives now — the toast's signpost. "it's ready in People". */
					destination: row.category ? CATEGORY_LABELS[row.category] : row.label,
					carryover: carryoverSummary(carryover),
					chargedToday: result.chargedToday
				}
			};
		});
	},

	/** REMOVE. Closes the period — or voids it, if it opened today and cost nothing. */
	remove: async (event) => {
		return withBusiness(event, async (ctx) => {
			const moduleKey = moduleFrom(await event.request.formData());
			if (!moduleKey) {
				return fail(400, { message: "That isn't a module we know about." });
			}

			const result = await removeModule(ctx, moduleKey, new Date());

			return {
				removed: {
					moduleKey,
					label: label(moduleKey),
					charged: result.charged,
					sameDay: result.sameDay
				}
			};
		});
	},

	/**
	 * UNDO. Silently fine when there is nothing left to undo.
	 *
	 * Pressing Undo twice, or after removing the module in another tab, is not an error worth
	 * showing anybody — `undoAddition` returns null and the page simply reloads to the state
	 * they wanted anyway.
	 */
	undo: async (event) => {
		return withBusiness(event, async (ctx) => {
			const value = (await event.request.formData()).get('subscriptionId');
			if (typeof value !== 'string' || value.length === 0) {
				return fail(400, { message: 'Nothing to undo.' });
			}

			const result = await undoAddition(ctx, value, new Date());
			return { undone: result ? { label: label(result.moduleKey) } : null };
		});
	}
};
