/**
 * THE STOCK SCREEN.
 *
 * A STATIC route that wins over `[module=module]` for `/inventory`, which means it inherits that
 * route's responsibility as well as its path: the sidebar's promise is that a module row is a
 * real destination in all three access states, so this renders the locked and removed states
 * itself rather than 403-ing somebody who clicked a nav row on purpose. Same shape as
 * `/invoicing`, for the same reason.
 *
 * Creating this directory is the whole of SPA-6's first criterion. SvelteKit prefers a static
 * segment over a dynamic one, so `/inventory` stops resolving to the generic locked page the
 * moment this file exists — with no change to the param matcher, the catalogue or the nav.
 *
 * `moduleAccess` for the question, `withModule` for the enforcement. The two live side by side in
 * `ctx.ts` for exactly this case.
 *
 * ONE CLOCK READING. `now` is taken once and passed to every query and to the page, so the tab
 * counts, the summary sentence and the dates all describe the same instant.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { moduleAccess, withBusiness, withModule } from '$lib/server/core/ctx';
import { moduleRow, modulePrice } from '$lib/server/core/modules/catalogue';
import { carryoverSummary, loadCarryover } from '$lib/server/core/modules/carryover';
import { todayIn } from '$lib/core/calendar';
import { zero } from '$lib/core/money';
import {
	countPeriodFor,
	defaultDirection,
	isInventoryFilter,
	isInventorySort,
	isSortDirection,
	type InventoryFilter,
	type InventorySort,
	type SortDirection
} from '$lib/core/inventory';
import {
	DEFAULT_PAGE_SIZE,
	countItems,
	listItems,
	listLocations,
	summarise
} from '$lib/server/modules/inventory/queries';
import { resumeOrPrepareCount } from '$lib/server/modules/inventory/counts';
import { CannotDoThat, createItem } from '$lib/server/modules/inventory/effects';
import { parseItemForm } from '$lib/server/modules/inventory/wire';
import type { Actions, PageServerLoad } from './$types';

/** Every one of these falls back rather than erroring: a stale URL should show the list. */
function readFilter(url: URL): InventoryFilter {
	const value = url.searchParams.get('filter');
	return isInventoryFilter(value) ? value : 'all';
}

function readPage(url: URL): number {
	const value = Number(url.searchParams.get('page') ?? '1');
	return Number.isInteger(value) && value > 0 ? value : 1;
}

function readSort(url: URL): { sort: InventorySort; direction: SortDirection } {
	const value = url.searchParams.get('sort');
	const sort: InventorySort = isInventorySort(value) ? value : 'name';

	const dir = url.searchParams.get('dir');
	return { sort, direction: isSortDirection(dir) ? dir : defaultDirection() };
}

export const load: PageServerLoad = async (event) => {
	const access = moduleAccess(event, 'inventory');
	const row = moduleRow('inventory');
	const now = new Date();
	const today = todayIn(now);

	if (access === 'none') {
		// The locked state names what this business would actually get, which costs one small
		// query — and only here. An owned module never asks.
		const carryover = await withBusiness(event, async (ctx) =>
			carryoverSummary(await loadCarryover(ctx.tx, ctx.business, ctx.access))
		);

		return {
			access,
			module: { key: row.key, label: row.label, description: row.description, accent: row.accent },
			price: modulePrice('inventory'),
			carryover,
			today,
			filter: 'all' as InventoryFilter,
			search: '',
			items: [],
			counts: { all: 0, low: 0, archived: 0 },
			itemCount: 0,
			lowCount: 0,
			locationCount: 0,
			valueAtCost: zero('ZAR'),
			uncosted: 0,
			locations: [],
			page: 1,
			pageCount: 1,
			sort: 'name' as InventorySort,
			direction: 'asc' as SortDirection
		};
	}

	const filter = readFilter(event.url);
	const page = readPage(event.url);
	const search = event.url.searchParams.get('q') ?? '';
	const { sort, direction } = readSort(event.url);

	// `read` reaches here too, and that is the point of the middle access state: a removed
	// module's stock stays readable. The screen renders it without the affordances that write.
	return withModule(event, 'inventory', 'read', async (ctx) => {
		const [result, counts, totals, locations] = await Promise.all([
			listItems(ctx.tx, { filter, sort, direction, search, page }),
			countItems(ctx.tx),
			summarise(ctx.tx),
			listLocations(ctx.tx)
		]);

		return {
			access,
			module: { key: row.key, label: row.label, description: row.description, accent: row.accent },
			price: modulePrice('inventory'),
			carryover: null,
			today,
			filter,
			search,
			items: result.items,
			counts,
			itemCount: totals.itemCount,
			lowCount: totals.lowCount,
			locationCount: totals.locationCount,
			valueAtCost: totals.valueAtCost,
			uncosted: totals.uncosted,
			locations,
			page: result.page,
			sort,
			direction,
			// A count of pages, not an amount — there is no rounding policy for "how many pages".
			// eslint-disable-next-line no-restricted-syntax -- pages, not money
			pageCount: Math.max(1, Math.ceil(result.total / (result.pageSize || DEFAULT_PAGE_SIZE)))
		};
	});
};

export const actions: Actions = {
	/**
	 * Add an item.
	 *
	 * Parsed BEFORE `withModule`, so a malformed form costs no transaction — the same ordering
	 * `invoicing/[id]/save/+server.ts` uses and for the same reason.
	 *
	 * Redirects to the item it just made, mirroring invoicing's create action: it lands the person
	 * on the screen where they would do the next thing, and it means the item exists somewhere
	 * they can come back to from the first moment.
	 */
	create: async (event) => {
		const parsed = parseItemForm(await event.request.formData());
		if (!parsed.ok) return fail(422, { message: parsed.message });

		let id: string;
		try {
			id = await withModule(event, 'inventory', 'write', async (ctx) => {
				if (!ctx.business) error(500, { message: 'Something went wrong on our side.' });
				return createItem(
					ctx.tx,
					ctx.business.id,
					ctx.userId,
					parsed.value,
					parsed.openingQtyE6 === 0 ? null : { qtyE6: parsed.openingQtyE6, locationId: null }
				);
			});
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, {
				message: 'We could not save that item just now. Nothing was saved — try again.'
			});
		}

		redirect(303, `/inventory/${id}`);
	},

	/**
	 * START A STOCK COUNT — or go back to the one already open.
	 *
	 * THE ENTRY POINT IS THIS AUTHOR'S JUDGEMENT, NOT T24'S. The ticket specifies the four-step
	 * screen and says nothing about how a person reaches it, so this is the smallest thing that
	 * makes the flow reachable: one action on the screen where somebody is already looking at
	 * their stock. If the product later wants counts scheduled, or started from Home, this is the
	 * function that grows — nothing else in the flow knows how it was entered.
	 *
	 * RESUME BEFORE PREPARE, and that ordering is the whole of it — but the ordering is NOT the
	 * whole of the safety, so it does not live here. Every `prepareCount` burns an `SC-` number
	 * and snapshots forty-eight lines; a second click that made a second count would leave the
	 * first one orphaned behind Home's resume card, which shows exactly one. Two clicks half a
	 * second apart are two transactions, and a check-then-act spread across two of them is a
	 * race whatever order it is written in. `resumeOrPrepareCount` takes an advisory lock on the
	 * business before it looks, so the second click waits and then finds the first click's count
	 * — see the header on it, which is where that argument belongs, beside the only file that
	 * writes the table.
	 *
	 * The period is the calendar month somebody is standing in — see `countPeriodFor`, which
	 * explains why it is this month rather than the last complete one.
	 */
	count: async (event) => {
		let id: string;
		try {
			id = await withModule(event, 'inventory', 'write', (ctx) =>
				resumeOrPrepareCount(
					ctx.tx,
					ctx.business.id,
					ctx.userId,
					countPeriodFor(todayIn(new Date()))
				)
			);
		} catch (cause) {
			if (cause instanceof CannotDoThat) return fail(422, { message: cause.message });
			return fail(500, {
				message: 'We could not start a stock count just now. Nothing was changed — try again.'
			});
		}

		redirect(303, `/inventory/counts/${id}`);
	}
};
