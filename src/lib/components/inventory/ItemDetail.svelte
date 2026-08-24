<script lang="ts">
	/**
	 * ONE ITEM — the quantity, then the story of it.
	 *
	 * The same two-part shape the invoice detail uses: the answer at the top, and the reasoning
	 * behind it one glance away. Here the answer is a number, and the reasoning is the ledger that
	 * produced it — which is why the header quantity and the newest row's running balance are
	 * always the same figure, and why nothing on this screen reads a stored level.
	 *
	 * "WHERE IT IS" IS A TABLE, not a sentence, because an item can be in several places and a
	 * sentence would have to pick one. It comes straight from `inventory_level`, which is the
	 * visible payoff of the view: no code assembles those numbers, they are the movements.
	 */
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Package from '@lucide/svelte/icons/package';
	import Pencil from '@lucide/svelte/icons/pencil';
	import {
		Amount,
		Blank,
		Button,
		Qty,
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
		UnitPrice
	} from '$lib/ui';
	import { standingSentence, type InventoryItem } from '$lib/core/inventory';
	import { formatShortDate } from '$lib/core/calendar';
	import type { Money, Quantity } from '$lib/core/money';
	import type { MovementReason } from '$lib/core/inventory';
	import MovementHistory from './MovementHistory.svelte';
	import StockBadge from './StockBadge.svelte';

	type PlaceRow = {
		locationId: string;
		locationName: string;
		onHand: Quantity;
		lastMovedOn: string | null;
	};
	type MovementRow = {
		id: string;
		locationName: string;
		qty: Quantity;
		reason: MovementReason;
		sourceRef: string | null;
		note: string | null;
		balanceAfter: Quantity;
		occurredOn: string;
	};

	let {
		item,
		sku,
		description,
		onHand,
		locationName,
		places,
		valueAtCost,
		movements,
		page,
		pageCount,
		pageHref,
		readOnly = false,
		onedit,
		onarchive,
		onrestore
	}: {
		item: InventoryItem;
		sku: string | null;
		description: string | null;
		onHand: Quantity;
		locationName: string | null;
		places: readonly PlaceRow[];
		valueAtCost: Money | null;
		movements: readonly MovementRow[];
		page: number;
		pageCount: number;
		pageHref: (page: number) => string;
		readOnly?: boolean;
		onedit?: () => void;
		onarchive?: () => void;
		onrestore?: () => void;
	} = $props();

	const archived = $derived(item.archivedAt !== null);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="mx-auto w-full max-w-5xl px-4 py-8 lg:px-8">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<!-- Breadcrumb: the module, then this item's own code if it has one. -->
			<p class="flex items-center gap-1.5 text-helper font-medium">
				<Package class="size-3.5 text-inventory" aria-hidden="true" />
				<a
					href="/inventory"
					class="rounded-[5px] text-inventory-ink outline-none hover:underline
						focus-visible:outline-2 focus-visible:outline-offset-2
						focus-visible:outline-brand-focus-ring">Inventory</a
				>
				{#if sku}
					<span class="text-ink-muted" aria-hidden="true">/</span>
					<span class="numeric text-ink-muted">{sku}</span>
				{/if}
			</p>

			<h1
				class="mt-1 flex flex-wrap items-center gap-3 text-[20px] font-semibold text-ink lg:text-[24px]"
			>
				{item.name}
				<StockBadge {item} {onHand} />
			</h1>

			<!-- "12 board on hand in Rack A. Reorder at 12." — pure, tested, one sentence. -->
			<p class="mt-1 text-ui text-ink-secondary">{standingSentence(item, onHand, locationName)}</p>

			<!--
				The consequence, stated before the action rather than in a dialog after it. Archiving
				is reversible and says so; an archived item says what being archived means, so nobody
				has to work out why it stopped appearing in their counts.
			-->
			{#if archived}
				<p class="mt-2 max-w-[520px] text-helper text-ink-muted">
					Archived. It keeps every movement it ever had, and stays out of your stock list, your
					running-low count and your valuation until you restore it.
				</p>
			{:else if !readOnly}
				<p class="mt-2 max-w-[520px] text-helper text-ink-muted">
					Archiving takes an item out of your list without losing any of its history, and you can
					restore it at any time.
				</p>
			{/if}

			{#if description}
				<p class="mt-2 max-w-[520px] text-ui text-ink-secondary">{description}</p>
			{/if}
		</div>

		{#if !readOnly}
			<div class="flex items-center gap-2">
				<Button variant="secondary" onclick={onedit}>
					<Pencil class="size-4" aria-hidden="true" />
					Edit
				</Button>
				<!--
					ARCHIVING IS REVERSIBLE, SO IT GETS A BUTTON AND NOT A DIALOG.
					`CancelInvoiceDialog` exists because cancelling is a one-way door — "a one-way door
					with a one-click handle is the exact failure the sentence exists to prevent."
					Discarding a draft, which is the same shape as this, is a plain secondary button.
					The consequence is stated beneath rather than in a dialog after the fact, which is
					T21's rule: the interface says what will happen BEFORE the action.
				-->
				{#if archived}
					<Button variant="secondary" onclick={onrestore}>
						<ArchiveRestore class="size-4" aria-hidden="true" />
						Restore
					</Button>
				{:else}
					<Button variant="quiet" onclick={onarchive}>
						<Archive class="size-4" aria-hidden="true" />
						Archive
					</Button>
				{/if}
			</div>
		{/if}
	</div>

	<dl
		class="mt-6 flex flex-wrap items-start gap-x-12 gap-y-4 rounded-[10px] border
			border-line-default bg-surface-card px-5 py-[18px]"
	>
		<div>
			<dt class="text-helper text-ink-muted">On hand</dt>
			<dd class="mt-0.5 flex items-baseline gap-1.5">
				<Qty value={onHand} class="text-[18px]" />
				<span class="text-helper text-ink-muted">{item.unitOfMeasure}</span>
			</dd>
		</div>

		<div>
			<dt class="text-helper text-ink-muted">Reorder at</dt>
			<dd class="mt-0.5"><Qty value={item.reorderPoint} class="text-[18px]" /></dd>
		</div>

		<div>
			<dt class="text-helper text-ink-muted">What it costs you</dt>
			<dd class="mt-0.5">
				<!-- An unrecorded cost renders "—", never R0. Rendering an absent value as zero is a lie. -->
				{#if item.costPrice}
					<UnitPrice value={item.costPrice} />
				{:else}
					<Blank kind="unknown" />
				{/if}
			</dd>
		</div>

		<div>
			<dt class="text-helper text-ink-muted">What you sell it for</dt>
			<dd class="mt-0.5">
				{#if item.sellPrice}
					<UnitPrice value={item.sellPrice} />
				{:else}
					<Blank kind="unknown" />
				{/if}
			</dd>
		</div>

		<div>
			<dt class="text-helper text-ink-muted">Value at cost</dt>
			<dd class="mt-0.5">
				{#if valueAtCost}
					<Amount value={valueAtCost} size="lg" decimals={0} />
				{:else}
					<Blank kind="unknown" />
				{/if}
			</dd>
		</div>
	</dl>

	{#if places.length > 0}
		<section class="mt-8">
			<h2 class="text-[16px] font-medium text-ink">Where it is</h2>
			<div class="mt-3 overflow-hidden rounded-[10px] border border-line-default">
				<Table>
					<TableHeader class="bg-surface-card">
						<TableRow>
							<TableHead>Place</TableHead>
							<TableHead class="text-right">On hand</TableHead>
							<TableHead class="text-right">Last moved</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each places as place (place.locationId)}
							<TableRow>
								<TableCell class="text-ui text-ink">{place.locationName}</TableCell>
								<TableCell class="text-right">
									<Qty value={place.onHand} />
									<span class="ml-1 text-helper text-ink-muted">{item.unitOfMeasure}</span>
								</TableCell>
								<TableCell class="text-right numeric text-helper text-ink-secondary">
									{place.lastMovedOn ? formatShortDate(place.lastMovedOn) : '—'}
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</section>
	{/if}

	<MovementHistory {movements} unit={item.unitOfMeasure} {page} {pageCount} {pageHref} />
</div>
