<script lang="ts">
	/**
	 * ONE ITEM ON A PHONE.
	 *
	 * The desktop table is something you scan; a card is something you read one at a time. The
	 * question on a phone is usually "have we got any" — so the quantity is the largest thing on
	 * the card, with the reorder point stated beside it so the comparison still needs no colour.
	 *
	 * A whole-card link rather than a row of controls: the phone screen is read-only in SPA-6, and
	 * a 44px target that opens the item is worth more than three that do not fit.
	 */
	import { Qty } from '$lib/ui';
	import { isBelowReorderPoint, type InventoryListItem } from '$lib/core/inventory';
	import StockBadge from './StockBadge.svelte';

	let { row }: { row: InventoryListItem } = $props();

	const low = $derived(isBelowReorderPoint(row.item, row.onHand));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<a
	href="/inventory/{row.item.id}"
	class="flex min-h-11 flex-col gap-2.5 rounded-[10px] border p-4 outline-none
		focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid
		{low ? 'border-line-strong bg-surface-card' : 'border-line-default'}"
>
	<div class="flex items-start justify-between gap-3">
		<span class="min-w-0 text-ui text-ink">{row.item.name}</span>
		<StockBadge item={row.item} onHand={row.onHand} />
	</div>

	<div class="flex items-baseline gap-2">
		<Qty value={row.onHand} class="text-[22px]" />
		<span class="text-ui text-ink-secondary">{row.item.unitOfMeasure}</span>
	</div>

	<p class="text-helper text-ink-muted">
		Reorder at <Qty value={row.item.reorderPoint} class="text-helper text-ink-muted" />
		{#if row.locationName}· {row.locationName}{/if}
	</p>
</a>
