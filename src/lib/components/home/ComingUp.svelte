<script lang="ts">
	/**
	 * COMING UP — the right column's top panel.
	 *
	 * A 46px mono date column, then the item. Giving the date a column of its own is what makes
	 * the list scannable as dates rather than as sentences that happen to start with one, and
	 * mono tabular figures are what keep "8 Aug" and "25 Aug" aligned under each other.
	 *
	 * The date column is a MINIMUM rather than a fixed width. The design's 46px fits "25 Aug";
	 * a locale that spells the month "Sept" needs a few more pixels, and a column that clipped
	 * the month to keep the grid would be the wrong thing to protect.
	 *
	 * Rows are dividers, not cards: this is a list of when, not a set of things to click.
	 * Nothing here is a control, and nothing here counts down — see the note in
	 * `platform.ts` about the renewal row.
	 */
	import type { AgendaRow } from '$lib/core/home';

	let { rows }: { rows: readonly AgendaRow[] } = $props();
</script>

<section data-slot="coming-up" class="flex flex-col gap-2.5" aria-labelledby="coming-up-eyebrow">
	<h2 id="coming-up-eyebrow" class="eyebrow">Coming up</h2>

	<!-- 6px vertical, 16px horizontal padding — the rows do the spacing, not the panel. -->
	<div class="rounded-[10px] bg-surface-card px-4 py-1.5">
		{#if rows.length > 0}
			<ul>
				{#each rows as row (row.id)}
					<li class="flex gap-3 border-b border-line-subtle py-3 last:border-b-0">
						<span class="min-w-[46px] shrink-0 numeric text-helper text-ink-muted"
							>{row.dateLabel}</span
						>
						<span class="min-w-0 flex-1">
							<span class="block text-[13px] text-ink">{row.title}</span>
							{#if row.detail}
								<span class="mt-0.5 block text-helper text-ink-muted">{row.detail}</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="py-3 text-[13px] text-ink-muted">Nothing scheduled.</p>
		{/if}
	</div>
</section>
