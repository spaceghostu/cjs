<script lang="ts">
	/**
	 * THIS MONTH, PLAINLY.
	 *
	 * Three cards, and exactly one of them is coloured. The design's rule from the invoice list
	 * applies here too and is the reason this component takes an `emphasis` rather than a
	 * colour: money is neutral, and colour flags the exception. A screen where every figure is
	 * tinted tells the owner nothing about which one wants them.
	 *
	 * A card with no figure shows its FOOTNOTE and no amount. That is the whole point of the
	 * slot model — "Money you owe" has no module behind it, and the card says so instead of
	 * showing R0. R0 owed and nothing to go on look identical on a card and mean opposite
	 * things.
	 */
	import { Amount } from '$lib/ui';
	import type { MonthCard } from '$lib/core/home';

	let { cards }: { cards: readonly MonthCard[] } = $props();
</script>

<!--
	A <div>, not a labelled <section>: the page already wraps this grid in a section named by
	the "This month" eyebrow, so a second landmark in here carrying the same name gave every
	screen-reader landmark list "This month" twice (axe: landmark-unique). The composition owns
	the landmark; this component is just the cards.
-->
<div data-slot="month" class="grid gap-3.5 sm:grid-cols-3">
	{#each cards as card (card.slot)}
		<!-- 18px padding, 8px internal gap, 10px radius. -->
		<div class="flex flex-col gap-2 rounded-[10px] bg-surface-card p-[18px]">
			<span class="text-[13px] text-ink-secondary">{card.label}</span>

			{#if card.amount}
				<Amount
					value={card.amount}
					size="xl"
					tone={card.emphasis === 'receivable' ? 'owed' : 'default'}
					decimals={0}
				/>
			{:else}
				<!--
					Not `<Blank>`: an em dash says "there is a value and we do not have it". Here
					there is no value to have, and the footnote below is the answer — so the space
					is held open at the same height and left quiet, and the eye goes to the words.
				-->
				<span aria-hidden="true" class="numeric text-[24px] tracking-[-0.02em] text-ink-muted">
					—
				</span>
			{/if}

			<span class="text-helper text-ink-muted">{card.footnote}</span>
		</div>
	{/each}
</div>
