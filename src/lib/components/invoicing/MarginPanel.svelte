<script lang="ts">
	/**
	 * "THE NUMBERS BEHIND IT."
	 *
	 * Materials, Labour, and above a rule, **What you keep**. Plain language over accounting
	 * vocabulary — the design says "What you keep", not "gross margin", and that is not a
	 * simplification: it is the actual question the person reading this screen has.
	 *
	 * EVERY FIGURE COMES FROM A LEDGER POSTING. `$lib/server/modules/invoicing/margin.ts` reads
	 * `core_posting` and nothing else, so "See the workings" can open the entries themselves —
	 * and the panel cannot drift from the books, because it IS the books.
	 *
	 * WHEN THE COST IS NOT KNOWN, IT SAYS SO. An unknown cost is never treated as zero: zero cost
	 * and unknown cost produce the same margin arithmetic and mean opposite things, and only one
	 * of them is a claim this product is entitled to make. `marginPanel()` decides which of the
	 * three states applies; this renders them.
	 *
	 * (The design's own three figures do not reconcile — see the note at the top of
	 * `$lib/core/invoicing/margin.ts`. What is on this screen always adds up.)
	 */
	import { Amount, Button } from '$lib/ui';
	import { marginFootnote, type MarginPanel } from '$lib/core/invoicing';

	let {
		panel,
		fromInventory,
		workingsHref,
		inventoryHref = '/settings/modules'
	}: {
		panel: MarginPanel;
		fromInventory: boolean;
		workingsHref: string;
		inventoryHref?: string;
	} = $props();
</script>

<!-- Both hrefs are literal or built from an id — see the note in `InvoiceTable.svelte`. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<section class="rounded-[12px] border border-line-default bg-surface-card p-4">
	<h2 class="text-ui font-medium text-ink">The numbers behind it</h2>

	{#if panel.known}
		<dl class="mt-3 flex flex-col gap-2">
			{#each panel.margin.costs as cost (cost.kind)}
				<div class="flex items-baseline justify-between gap-4">
					<dt class="text-[13px] text-ink-secondary">{cost.label}</dt>
					<dd><Amount value={cost.amount} size="sm" /></dd>
				</div>
			{/each}

			<!-- Above a rule, as the design draws it: the figure the panel exists to show. -->
			<div class="mt-1 flex items-baseline justify-between gap-4 border-t border-line-default pt-3">
				<dt class="text-ui text-ink">What you keep</dt>
				<dd><Amount value={panel.margin.keep} size="md" tone="settled" /></dd>
			</div>
		</dl>

		<p class="mt-3 text-helper text-ink-muted">
			{marginFootnote(fromInventory)}
			<a
				href={workingsHref}
				class="text-brand-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2
					focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
			>
				See the workings.
			</a>
		</p>

		{#if panel.margin.caveat}
			<!--
				An upper bound, said out loud. A panel that quietly folded unknown costs into the
				margin would be flattering rather than honest, and this is the screen where that
				matters most.
			-->
			<p class="mt-2 text-helper text-attention-ink">{panel.margin.caveat}</p>
		{/if}
	{:else}
		<p class="mt-2 text-[13px] text-ink-secondary">{panel.unavailable.reason}</p>

		{#if panel.unavailable.offerInventory}
			<!--
				The one case with an obvious next step. Offered calmly and once — the design is
				explicit that this product does not manufacture urgency, and least of all to sell
				somebody a module.
			-->
			<div class="mt-3">
				<Button variant="secondary" href={inventoryHref}>Look at Inventory</Button>
			</div>
		{/if}
	{/if}
</section>
