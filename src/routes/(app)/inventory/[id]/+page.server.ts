/**
 * ONE ITEM.
 *
 * WRITE, NOT READ — the same decision `invoicing/[id]/+page.server.ts` makes, and worth stating
 * because it looks like an inconsistency next to the list. A business that has REMOVED Inventory
 * can still open the list and read its stock; opening a single item gets `entitlement.ts`'s
 * refusal instead, because this is the screen that CHANGES one. A screen whose every action will
 * be refused is worse than an honest 403 with a way back, which is what `refuse()` renders.
 *
 * Everything on this page is derived from `inventory_movement`. There is no level to read: the
 * header quantity is the sum the view produces, and the newest row of the history carries the
 * same figure as its running balance. That equality is asserted in `inventory.test.ts`.
 */
import { error, fail } from '@sveltejs/kit';
import { withModule } from '$lib/server/core/ctx';
import { todayIn } from '$lib/core/calendar';
import { lineAmount } from '$lib/core/money';
import {
	DEFAULT_PAGE_SIZE,
	levelsForItem,
	listLocations,
	listMovements,
	loadItem
} from '$lib/server/modules/inventory/queries';
import {
	CannotDoThat,
	archiveItem,
	restoreItem,
	updateItem
} from '$lib/server/modules/inventory/effects';
import { parseItemForm } from '$lib/server/modules/inventory/wire';
import type { Actions, PageServerLoad } from './$types';

function readPage(url: URL): number {
	const value = Number(url.searchParams.get('page') ?? '1');
	return Number.isInteger(value) && value > 0 ? value : 1;
}

export const load: PageServerLoad = async (event) => {
	return withModule(event, 'inventory', 'write', async (ctx) => {
		const page = readPage(event.url);

		const detail = await loadItem(ctx.tx, event.params.id);
		// RLS has already made "another business's item" and "no such item" the same answer.
		if (!detail) error(404, { message: "We couldn't find that item." });

		const [places, history, locations] = await Promise.all([
			levelsForItem(ctx.tx, event.params.id),
			listMovements(ctx.tx, event.params.id, { page }),
			listLocations(ctx.tx)
		]);

		return {
			today: todayIn(new Date()),
			item: detail.item,
			sku: detail.sku,
			description: detail.description,
			onHand: detail.onHand,
			locationName: detail.locationName,
			places,
			// Null rather than zero when the cost is unknown — the panel says "—", not "R0".
			valueAtCost: detail.item.costPrice ? lineAmount(detail.item.costPrice, detail.onHand) : null,
			movements: history.movements,
			locations,
			page: history.page,
			// eslint-disable-next-line no-restricted-syntax -- pages, not money
			pageCount: Math.max(1, Math.ceil(history.total / (history.pageSize || DEFAULT_PAGE_SIZE)))
		};
	});
};

export const actions: Actions = {
	/**
	 * Edit the item's details. NOT its quantity — there is no quantity here to edit, and no action
	 * anywhere that writes one. Stock moves by recording what moved.
	 */
	update: async (event) => {
		const parsed = parseItemForm(await event.request.formData());
		if (!parsed.ok) return fail(422, { message: parsed.message });

		try {
			await withModule(event, 'inventory', 'write', (ctx) =>
				updateItem(ctx.tx, ctx.business.id, event.params.id, parsed.value)
			);
			return { saved: true };
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, {
				message: 'We could not save those changes just now. Nothing was changed — try again.'
			});
		}
	},

	/**
	 * Archive, and un-archive.
	 *
	 * Not a deletion — the application role holds no DELETE anywhere in `public`, and an item's
	 * movements are the history of stock the business really had. Reversible, which is why the
	 * screen does not warn about it first.
	 */
	archive: async (event) => {
		try {
			await withModule(event, 'inventory', 'write', (ctx) => archiveItem(ctx.tx, event.params.id));
			return { archived: true };
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, { message: 'We could not archive that item just now. Try again.' });
		}
	},

	restore: async (event) => {
		try {
			await withModule(event, 'inventory', 'write', (ctx) => restoreItem(ctx.tx, event.params.id));
			return { restored: true };
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, { message: 'We could not restore that item just now. Try again.' });
		}
	}
};
