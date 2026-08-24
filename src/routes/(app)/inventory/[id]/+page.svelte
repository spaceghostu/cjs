<script lang="ts">
	/**
	 * One item: the quantity, then the ledger that produced it.
	 *
	 * No access branch here, unlike the list. This route lets `withModule` refuse — see the header
	 * comment on `+page.server.ts` for why the detail is `write` where the list is `read`.
	 */
	import { ItemDetail, ItemDialog } from '$lib/components/inventory';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let editing = $state(false);

	/** Reopen on a refusal, so the reason sits beside the work rather than replacing it. */
	$effect(() => {
		if (form?.message) editing = true;
	});

	function pageHref(page: number): string {
		const params = new SvelteURLSearchParams();
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `?${query}` : '?';
	}
</script>

<svelte:head><title>{data.item.name} · Stock · CJs</title></svelte:head>

{#if form?.message}
	<div class="mx-auto w-full max-w-5xl px-4 pt-4 lg:px-8">
		<p
			class="rounded-[10px] border border-wrong-border bg-wrong-tint px-4 py-3 text-ui text-wrong-ink"
			aria-live="polite"
		>
			{form.message}
		</p>
	</div>
{/if}

<ItemDetail
	item={data.item}
	sku={data.sku}
	description={data.description}
	onHand={data.onHand}
	locationName={data.locationName}
	places={data.places}
	valueAtCost={data.valueAtCost}
	movements={data.movements}
	page={data.page}
	pageCount={data.pageCount}
	{pageHref}
	onedit={() => (editing = true)}
/>

<ItemDialog
	bind:open={editing}
	mode="edit"
	item={data.item}
	sku={data.sku}
	locationName={data.locationName}
	locations={data.locations}
	message={form?.message ?? null}
/>
