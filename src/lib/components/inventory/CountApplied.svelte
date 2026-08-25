<script lang="ts">
	/**
	 * STEP 4 — WHAT ACTUALLY HAPPENED.
	 *
	 * T24 does not draw this step either, so the register is the one the rest of the flow set:
	 * state the facts, name the figures, and offer the next thing rather than congratulating
	 * anybody. A confirmation screen that says "Success!" has told a person nothing they can act
	 * on.
	 *
	 * THE TICK IS EARNED HERE IN A WAY IT IS NOWHERE ELSE. Everything before this step was
	 * provisional; this is the one moment in the flow where something has genuinely and
	 * irreversibly happened. `app.freeze_applied_count()` makes `applied` terminal — a count
	 * cannot be un-applied, and the way back is a NEW count or a correcting movement, which is
	 * what the second sentence offers rather than a disabled undo button.
	 *
	 * AND IT POINTS AT THE EVIDENCE. Every movement this count wrote carries `sourceRef` — the
	 * count's own number — so an item's history explains itself without anybody having to
	 * remember. Saying so is what turns "we changed your stock" into something checkable.
	 */
	import Check from '@lucide/svelte/icons/check';
	import { Amount, Button } from '$lib/ui';
	import { countAppliedCopy, uncostedNote } from '$lib/core/inventory';
	import type { Money } from '$lib/core/money';

	let {
		movements,
		net,
		uncosted = 0,
		number
	}: {
		movements: number;
		net: Money;
		uncosted?: number;
		/** `SC-0001`. The reason written on every movement this count produced. */
		number: string;
	} = $props();

	const said = $derived(countAppliedCopy(movements));
	const caveat = $derived(uncostedNote(uncosted));
</script>

<section class="mt-6 rounded-[10px] border border-line-default bg-surface-card p-7">
	<span
		class="flex size-9 items-center justify-center rounded-full bg-settled-tint"
		aria-hidden="true"
	>
		<Check size={18} strokeWidth={2.5} class="text-settled" />
	</span>

	<h2 class="mt-3 text-section text-ink">{said.headline}</h2>
	<p class="mt-1 max-w-[64ch] text-ui text-ink-secondary">{said.explanation}</p>

	{#if movements > 0}
		<p class="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-ui text-ink-secondary">
			<span>Net effect on stock value</span>
			<Amount value={net} size="lg" class="text-ink" decimals={0} signed />
		</p>
	{/if}

	{#if caveat}
		<p class="mt-1 text-helper text-attention-ink">{caveat}</p>
	{/if}

	<p class="mt-3 text-helper text-ink-muted">
		Every movement above is filed under <span class="numeric">{number}</span>, so an item's history
		says where the change came from.
	</p>

	<!--
		`applied` is terminal at the database, so there is no undo to offer and no disabled button
		pretending there might be. The honest next step is the stock list, where the new
		quantities are.
	-->
	<Button href="/inventory" class="mt-5">Back to your stock</Button>
</section>
