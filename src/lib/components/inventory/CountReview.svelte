<script lang="ts">
	/**
	 * STEP 3 — WHAT WILL CHANGE, AND THE LAST POINT OF RETURN.
	 *
	 * T24 does not draw this step, so it is built in the register of the one it does draw: the
	 * same six columns, the same mono numerals, the same plinth underneath. What differs is the
	 * one thing that matters — THERE IS NOTHING TO TYPE HERE. Step 2 is work; step 3 is a
	 * decision, and a decision screen with editable fields on it invites somebody to fix a number
	 * at the moment they are meant to be reading them.
	 *
	 * IT LISTS ONLY WHAT WILL CHANGE. `applyCount` writes one movement per varying line and none
	 * for anything else, so this is that list exactly — not the whole sheet with the changes
	 * highlighted. The forty-two that matched are stated as a fact above the table and take up no
	 * room, because nothing is going to happen to them.
	 *
	 * AND IT SAYS WHAT HAPPENS TO THE SHELVES NOBODY REACHED. That sentence, from
	 * `countReviewCopy`, is the one an interface forgets — and forgetting it is how a person
	 * applies a count believing an unvisited rack has been written off as a total loss.
	 *
	 * THE FIGURE HERE AND THE FIGURE IN THE FOOTER ARE THE SAME OBJECT. Both come from
	 * `reviewCount` on the server, which calls `netValueEffect` — the same function the sticky
	 * footer totalled with on step 2. T24 makes that agreement an acceptance criterion, and one
	 * shared function is the only way to keep it true.
	 */
	import { Amount, Qty, signedQtyText } from '$lib/ui';
	import { countReviewCopy, matchedRowLabel, type TriagedRow } from '$lib/core/inventory';

	let {
		changes,
		matched,
		uncounted
	}: {
		/** The varying lines, in the order the sheet triaged them. One movement each. */
		changes: readonly TriagedRow[];
		/** How many matched exactly. Stated, not listed — nothing is going to happen to them. */
		matched: number;
		/** How many were never counted. Nothing is recorded against these either. */
		uncounted: number;
	} = $props();

	const said = $derived(countReviewCopy(changes.length, uncounted));

	const COLUMNS = 'grid-cols-[1fr_150px_100px_120px_110px_130px]';
</script>

<section class="mt-6">
	<h2 class="text-section text-ink">{said.headline}</h2>
	<p class="mt-1 max-w-[64ch] text-ui text-ink-secondary">{said.explanation}</p>

	{#if matched > 0}
		<p class="mt-1 text-ui text-ink-secondary">
			{matchedRowLabel(matched)}, and nothing will be recorded against them.
		</p>
	{/if}

	{#if changes.length > 0}
		<div class="mt-4 overflow-x-auto">
			<div class="min-w-[860px] overflow-hidden rounded-[10px] border border-line-default">
				<div
					class="grid {COLUMNS} gap-3 border-b border-line-default bg-surface-card px-3 py-2
						text-eyebrow text-ink-muted uppercase"
				>
					<span>Item</span>
					<span>Where</span>
					<span class="text-right">Expected</span>
					<span class="text-right">You counted</span>
					<span class="text-right">Difference</span>
					<span class="text-right">Value effect</span>
				</div>

				{#each changes as row (row.line.id)}
					<div class="grid {COLUMNS} items-center gap-3 border-b border-line-row px-3 py-2.5">
						<span class="min-w-0 truncate text-ui text-ink">{row.itemName}</span>
						<span class="min-w-0 truncate text-ui text-ink-secondary">{row.locationName}</span>

						<Qty value={row.line.expected} class="text-right text-ink-secondary" />

						{#if row.line.counted !== null}
							<Qty value={row.line.counted} class="text-right" />
						{:else}
							<span class="text-right numeric text-ui text-ink-muted" aria-hidden="true">—</span>
						{/if}

						<span
							class="text-right numeric text-ui {row.difference.e6 < 0
								? 'text-attention'
								: 'text-ink-secondary'}"
						>
							{signedQtyText(row.difference)}
						</span>

						{#if row.valueEffect}
							<Amount value={row.valueEffect} class="text-right" signed />
						{:else}
							<!--
								A line nobody can value still MOVES — the quantity is real, only the money
								is unknown. Saying "—" and stating the count in the footer is the honest
								rendering; folding an unknown into the total as a zero is not.
							-->
							<span class="text-right numeric text-ui text-ink-muted">
								<span aria-hidden="true">—</span>
								<span class="sr-only">No cost recorded for this item</span>
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
