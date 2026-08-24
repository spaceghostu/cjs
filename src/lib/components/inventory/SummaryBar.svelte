<script lang="ts">
	/**
	 * `48 items · Running low None · R412 000 at cost`.
	 *
	 * The neutrality rule T20 states for money holds for quantities too: nothing here is coloured
	 * except the exception. "Running low" renders the WORD `None` at zero rather than `0`, exactly
	 * as the invoicing summary does for Overdue — a zero that matters is told to the owner, not
	 * left for them to work out from a figure.
	 *
	 * THE VALUATION STATES WHAT IT COULD NOT COUNT. An item with no recorded cost contributes
	 * nothing, and a figure that quietly omitted it while presenting itself as complete would be
	 * understating what the business owns. The count sits underneath in 12px rather than being
	 * folded in as a zero.
	 */
	import { Amount, Blank } from '$lib/ui';
	import type { Money } from '$lib/core/money';

	let {
		itemCount,
		lowCount,
		locationCount,
		valueAtCost,
		uncosted
	}: {
		itemCount: number;
		lowCount: number;
		locationCount: number;
		valueAtCost: Money;
		uncosted: number;
	} = $props();
</script>

<dl
	class="mt-5 flex flex-wrap items-start gap-x-12 gap-y-4 rounded-[10px] border border-line-default
		bg-surface-card px-5 py-[18px]"
>
	<div>
		<dt class="text-helper text-ink-muted">Items counted</dt>
		<dd class="mt-0.5 numeric text-[18px] text-ink">{itemCount}</dd>
	</div>

	<div>
		<dt class="text-helper text-ink-muted">Running low</dt>
		<dd class="mt-0.5">
			{#if lowCount === 0}
				<Blank kind="none" class="text-[18px]" />
			{:else}
				<span class="numeric text-[18px] text-attention-ink">{lowCount}</span>
			{/if}
		</dd>
	</div>

	<div>
		<dt class="text-helper text-ink-muted">Stock value at cost</dt>
		<dd class="mt-0.5"><Amount value={valueAtCost} size="lg" decimals={0} /></dd>
		{#if uncosted > 0}
			<dd class="mt-0.5 text-helper text-ink-muted">
				{uncosted}
				{uncosted === 1 ? 'item has' : 'items have'} no cost recorded
			</dd>
		{/if}
	</div>

	<div>
		<dt class="text-helper text-ink-muted">Places</dt>
		<dd class="mt-0.5 numeric text-[18px] text-ink">{locationCount}</dd>
	</div>
</dl>
