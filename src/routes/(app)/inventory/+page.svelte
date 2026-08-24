<script lang="ts">
	/**
	 * Three states, from entitlement — the same three the dynamic module route renders, because a
	 * static route that wins over it inherits its job:
	 *
	 *   none   never owned  — `LockedModule`. Calm, concrete, no urgency.
	 *   read   removed      — `RemovedModule`, above the stock, which stays readable.
	 *   write  owned        — the module.
	 *
	 * This is SPA-6's first acceptance criterion: a business that has PAID for Inventory now gets
	 * the third of those rather than the first.
	 */
	import { ItemDialog, ItemList } from '$lib/components/inventory';
	import { LockedModule, RemovedModule } from '$lib/components/modules';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { defaultDirection, type InventoryFilter, type InventorySort } from '$lib/core/inventory';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let creating = $state(false);

	/**
	 * The dialog reopens itself when the server refused the form, so the person's work is still on
	 * screen next to the reason it was not accepted — rather than being dropped behind a toast.
	 */
	$effect(() => {
		if (form?.message) creating = true;
	});

	/** The filter, the sort and the page live in the URL, so each is a real, shareable link. */
	function hrefFor(filter: InventoryFilter): string {
		const params = new SvelteURLSearchParams();
		if (filter !== 'all') params.set('filter', filter);
		if (data.search) params.set('q', data.search);
		const query = params.toString();
		return query ? `?${query}` : '?';
	}

	function pageHref(page: number): string {
		const params = new SvelteURLSearchParams();
		if (data.filter !== 'all') params.set('filter', data.filter);
		if (data.search) params.set('q', data.search);
		if (data.sort !== 'name') params.set('sort', data.sort);
		if (data.direction !== 'asc') params.set('dir', data.direction);
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `?${query}` : '?';
	}

	/**
	 * Clicking a column heading.
	 *
	 * The column already sorted flips direction; a different one starts in its own natural
	 * direction. Paging resets, because page 4 of one order is nothing like page 4 of another.
	 */
	function sortHref(sort: InventorySort): string {
		const params = new SvelteURLSearchParams();
		if (data.filter !== 'all') params.set('filter', data.filter);
		if (data.search) params.set('q', data.search);

		const direction =
			data.sort === sort ? (data.direction === 'asc' ? 'desc' : 'asc') : defaultDirection();

		if (sort !== 'name') params.set('sort', sort);
		if (direction !== 'asc') params.set('dir', direction);

		const query = params.toString();
		return query ? `?${query}` : '?';
	}
</script>

<svelte:head><title>Stock · CJs</title></svelte:head>

{#if data.access === 'none'}
	<div class="mx-auto w-full max-w-2xl px-4 py-10 lg:py-16">
		<LockedModule
			moduleKey="inventory"
			label={data.module.label}
			accent={data.module.accent}
			price={data.price}
			carryover={data.carryover}
		/>
	</div>
{:else}
	{#if data.access === 'read'}
		<div class="mx-auto w-full max-w-6xl px-4 pt-8 lg:px-8">
			<RemovedModule moduleKey="inventory" label={data.module.label} accent={data.module.accent} />
		</div>
	{/if}

	<ItemList
		items={data.items}
		counts={data.counts}
		filter={data.filter}
		itemCount={data.itemCount}
		lowCount={data.lowCount}
		locationCount={data.locationCount}
		valueAtCost={data.valueAtCost}
		uncosted={data.uncosted}
		page={data.page}
		pageCount={data.pageCount}
		sort={data.sort}
		direction={data.direction}
		{hrefFor}
		{pageHref}
		{sortHref}
		readOnly={data.access === 'read'}
		oncreate={() => (creating = true)}
	/>

	{#if data.access === 'write'}
		<ItemDialog
			bind:open={creating}
			mode="create"
			locations={data.locations}
			message={form?.message ?? null}
		/>
	{/if}
{/if}
