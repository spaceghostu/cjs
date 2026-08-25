<script lang="ts">
	/**
	 * "WHAT YOU'RE QUOTING."
	 *
	 * A bordered table, radius `10px`, columns `1fr 68px 108px 108px` — Item, Qty, Unit price,
	 * Total. Header row on `--surface-card`. Each line: a description at 14px with a 12px
	 * provenance line beneath it, then three mono right-aligned numerals. Rows divided by
	 * `--border-row`.
	 *
	 * THE TOTAL COLUMN IS NOT COMPUTED HERE.
	 *
	 * It arrives as `amounts`, read off the priced document by index. A line priced on its own
	 * would not carry its share of a document-level discount, and there is no second place in
	 * this codebase where quantity is multiplied by price. See `$lib/core/quoting/pricing.ts`.
	 *
	 * THE LAST ROW IS THE ADD AFFORDANCE.
	 *
	 * "Add a line — or pick from Inventory". When Inventory is not owned that second half
	 * becomes the T13 contextual add rather than disappearing — an offer at the moment of need,
	 * with the way out underneath it. The caller supplies it as a snippet, because what to
	 * offer is entitlement's business and not this table's.
	 */
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Amount, FieldError, Input } from '$lib/ui';
	import { checkQuantity, checkUnitPrice } from '$lib/core/validation';
	import type { EditorLine } from '$lib/core/quoting';
	import type { Money } from '$lib/core/money';
	import type { Snippet } from 'svelte';

	let {
		lines = $bindable(),
		amounts,
		onadd,
		onremove,
		inventoryOffer
	}: {
		lines: EditorLine[];
		/** One per line, in order, from `priceDocument`. */
		amounts: readonly Money[];
		onadd: () => void;
		onremove: (id: string) => void;
		/** Rendered beside the add row. The Inventory picker, or T13's contextual add. */
		inventoryOffer?: Snippet;
	} = $props();

	const COLUMNS = 'grid-cols-[1fr_68px_108px_108px]';
</script>

<section>
	<h2 class="text-eyebrow text-ink-muted uppercase">What you're quoting</h2>

	<div class="mt-3 overflow-hidden rounded-[10px] border border-line-default">
		<div
			class="grid {COLUMNS} gap-3 border-b border-line-default bg-surface-card px-3 py-2 text-eyebrow text-ink-muted uppercase"
		>
			<span>Item</span>
			<span class="text-right">Qty</span>
			<span class="text-right">Unit price</span>
			<span class="text-right">Total</span>
		</div>

		{#each lines as line, i (line.id)}
			<!--
				The money core is asked, and its answer is handed to the message as it stands. An
				empty box is not a complaint — a line somebody has started but not priced is a
				normal state of a draft, and "Enter an amount." under every new row would be the
				table nagging about work in progress.
			-->
			{@const qty = line.qty.trim() === '' ? null : checkQuantity(line.qty)}
			{@const price = line.unitPrice.trim() === '' ? null : checkUnitPrice(line.unitPrice)}
			{@const qtyBad = qty !== null && !qty.ok}
			{@const priceBad = price !== null && !price.ok}
			{@const messageId = `quote-line-${line.id}-message`}
			<div class="grid {COLUMNS} items-start gap-3 border-b border-line-row px-3 py-2.5">
				<div class="min-w-0">
					<!--
						A bare input rather than a bordered field. The design's table is a table, and
						a grid of thirty-two visible input boxes reads as a form to fill in rather
						than a document to compose.
					-->
					<input
						class="w-full bg-transparent text-ui text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
						placeholder="What are you quoting for?"
						aria-label="Item {i + 1} description"
						bind:value={line.description}
					/>
					{#if line.provenance}
						<p class="mt-0.5 text-helper text-ink-muted">{line.provenance}</p>
					{/if}
				</div>

				<div>
					<Input
						numeric
						class="h-8 px-2 text-right"
						inputmode="decimal"
						aria-label="Item {i + 1} quantity"
						aria-invalid={qtyBad ? 'true' : undefined}
						aria-describedby={qtyBad ? messageId : undefined}
						bind:value={line.qty}
					/>
				</div>

				<div>
					<Input
						numeric
						class="h-8 px-2 text-right"
						inputmode="decimal"
						aria-label="Item {i + 1} unit price"
						aria-invalid={priceBad ? 'true' : undefined}
						aria-describedby={priceBad && !qtyBad ? messageId : undefined}
						bind:value={line.unitPrice}
					/>
				</div>

				<div class="flex items-center justify-end gap-2 pt-1.5">
					{#if amounts[i]}
						<Amount value={amounts[i]} size="sm" />
					{/if}
					<button
						type="button"
						class="rounded-sm p-1 text-ink-muted outline-none hover:text-wrong-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
						aria-label="Remove item {i + 1}"
						onclick={() => onremove(line.id)}
					>
						<Trash2 size={14} aria-hidden="true" />
					</button>
				</div>

				<!--
					One message per row, spanning it, rather than one under each of two 68px and
					108px cells. Quantity speaks first when both are unreadable: it is the number a
					person types first, and two complaints about one line reads as the row being
					broken rather than as two characters needing a look.
				-->
				{#if qtyBad || priceBad}
					<FieldError id={messageId} result={qtyBad ? qty : price} class="col-span-4" />
				{/if}
			</div>
		{/each}

		<div class="flex flex-wrap items-center gap-x-2 gap-y-3 px-3 py-2.5">
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-sm text-ui text-brand-ink outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
				onclick={onadd}
			>
				<Plus size={15} aria-hidden="true" />
				Add a line
			</button>
			{#if inventoryOffer}
				<span class="text-ui text-ink-muted">— or</span>
				{@render inventoryOffer()}
			{/if}
		</div>
	</div>
</section>
