<script lang="ts">
	/**
	 * THE STOCK TABLE — Item · On hand · Reorder at · Where · State.
	 *
	 * WHY "ON HAND" AND "REORDER AT" ARE ADJACENT COLUMNS, and not one column with a badge next
	 * to it: T27 §6 requires that no information is carried by colour alone, and says of the count
	 * table that "the sign carries it". The equivalent here is that the COMPARISON is on the row.
	 * `4` beside `Reorder at 12` is readable in greyscale, in a screenshot and printed; a lone `4`
	 * needs another column to mean anything.
	 *
	 * So the running-low signal has three carriers, in descending order of importance: the words
	 * in the badge, the two adjacent numbers, and — last and least — the row background. Take the
	 * colour away and the first two still say it.
	 *
	 * A real `<table>`, with real `<th scope>`. T27 §4: "Tables are tables." The design canvas is
	 * built from divs; that must not survive into the implementation, because a screen reader
	 * navigating a grid of divs has nothing to navigate.
	 */
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Qty } from '$lib/ui';
	import {
		INVENTORY_SORTS,
		isBelowReorderPoint,
		type InventoryListItem,
		type InventorySort,
		type SortDirection
	} from '$lib/core/inventory';
	import StockBadge from './StockBadge.svelte';

	let {
		items,
		sort,
		direction,
		sortHref
	}: {
		items: readonly InventoryListItem[];
		sort: InventorySort;
		direction: SortDirection;
		sortHref: (sort: InventorySort) => string;
	} = $props();

	const HEADINGS: Readonly<Record<InventorySort, string>> = {
		name: 'Item',
		onHand: 'On hand',
		reorderPoint: 'Reorder at',
		location: 'Where'
	};

	const lowCount = $derived(
		items.filter((row) => isBelowReorderPoint(row.item, row.onHand)).length
	);

	/** "Rack A · and one other place" — never implying an item is only ever in one. */
	function whereText(row: InventoryListItem): string | null {
		if (!row.locationName) return null;
		const others = row.placeCount - 1;
		if (others <= 0) return row.locationName;
		return `${row.locationName} · and ${others === 1 ? 'one other place' : `${others} other places`}`;
	}
</script>

<!-- Row and heading links are query strings on the current route — no route id to resolve. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="mt-4 overflow-hidden rounded-[10px] border border-line-default">
	<Table>
		<TableHeader class="bg-surface-card">
			<TableRow>
				{#each INVENTORY_SORTS as column (column)}
					{@const isSorted = sort === column}
					<TableHead
						class={column === 'name' ? '' : 'text-right'}
						aria-sort={isSorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
					>
						<a
							href={sortHref(column)}
							class="rounded-[5px] outline-none hover:text-ink focus-visible:outline-2
								focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
						>
							{HEADINGS[column]}
							<!--
								The arrow is decorative: `aria-sort` on the header already tells a screen
								reader the order, and reading "up arrow" after the column name would be
								noise on every heading.
							-->
							{#if isSorted}<span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span>{/if}
						</a>
					</TableHead>
				{/each}
				<TableHead class="text-right">State</TableHead>
			</TableRow>
		</TableHeader>

		<TableBody>
			{#each items as row (row.item.id)}
				{@const low = isBelowReorderPoint(row.item, row.onHand)}
				{@const where = whereText(row)}
				<TableRow class={low ? 'bg-surface-card' : undefined}>
					<TableCell>
						<a
							href="/inventory/{row.item.id}"
							class="rounded-[5px] text-ui text-ink outline-none hover:underline
								focus-visible:outline-2 focus-visible:outline-offset-2
								focus-visible:outline-brand-focus-ring"
						>
							{row.item.name}
						</a>
					</TableCell>

					<TableCell class="text-right">
						<Qty value={row.onHand} />
						<span class="ml-1 text-helper text-ink-muted">{row.item.unitOfMeasure}</span>
					</TableCell>

					<TableCell class="text-right">
						<Qty value={row.item.reorderPoint} class="text-ink-secondary" />
					</TableCell>

					<TableCell class="text-right text-ui text-ink-secondary">
						{#if where}
							{where}
						{:else}
							<span class="text-ink-muted">Nowhere yet</span>
						{/if}
					</TableCell>

					<TableCell class="text-right">
						<StockBadge item={row.item} onHand={row.onHand} />
					</TableCell>
				</TableRow>
			{/each}
		</TableBody>
	</Table>
</div>

<!--
	The same fact the badges carry, said once for somebody who is not reading cell by cell.
	`InvoiceTable` does the same thing for overdue invoices.
-->
<p class="sr-only" aria-live="polite">
	{lowCount} of {items.length}
	{items.length === 1 ? 'item' : 'items'} on this page {lowCount === 1 ? 'is' : 'are'} running low.
</p>
