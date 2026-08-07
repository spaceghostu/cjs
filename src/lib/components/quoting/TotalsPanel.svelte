<script lang="ts">
	/**
	 * "THE NUMBERS."
	 *
	 * A 300px column: "Before VAT", "VAT at 15%", then above a `--border-default` rule, "Client
	 * pays" at 14/500 with the total at 20px in the Quoting accent.
	 *
	 * Every figure comes from `priceDocument`. There is no arithmetic in this component and
	 * there is nowhere for any to go: a `Money` cannot be added to another `Money` without the
	 * money engine, by construction.
	 *
	 * "Client pays" rather than "Total". The design's word, and the better one — it says who
	 * pays what, which is the question the person building the quote is actually answering.
	 */
	import { Amount } from '$lib/ui';
	import type { QuotePrice } from '$lib/core/quoting';

	let { price, taxLabel }: { price: QuotePrice; taxLabel: string } = $props();
</script>

<section class="w-full max-w-[300px]">
	<div class="flex items-baseline justify-between">
		<span class="text-ui text-ink-secondary">Before VAT</span>
		<Amount value={price.subtotal} size="sm" />
	</div>

	<div class="mt-2 flex items-baseline justify-between">
		<span class="text-ui text-ink-secondary">{taxLabel}</span>
		<Amount value={price.tax} size="sm" />
	</div>

	<div class="mt-3 flex items-baseline justify-between border-t border-line-default pt-3">
		<span class="text-ui font-medium text-ink">Client pays</span>
		<Amount value={price.total} size="lg" class="text-quoting-ink" />
	</div>
</section>
