<script lang="ts">
	/**
	 * THE STICKY FOOTER — the running total, and the two ways out.
	 *
	 * `--surface-sunken` with a top border, sitting at the bottom of the viewport for as long as
	 * the sheet is longer than the screen. Left: the promise and the figures. Right: "Finish
	 * later" and the primary.
	 *
	 * "SAVED AUTOMATICALLY — LEAVE AND COME BACK WHENEVER." is the sentence the whole flow is
	 * arranged around, and it is in the FOOTER rather than in a toast because that is where
	 * somebody looks when they are deciding whether to stop. A message that appeared when a save
	 * happened would be telling them at the wrong moment.
	 *
	 * THE FIGURES ARE THE SAME ARITHMETIC AS THE REVIEW STEP, and T24 makes that an acceptance
	 * criterion — "the footer running total updates live and matches the review step exactly". The
	 * caller derives both from `netValueEffect` and `countProgress` over lines built by
	 * `liveLine`, and `reviewCount` on the server calls the very same pure functions over the very
	 * same rows. There is no second sum anywhere for the two to disagree about.
	 *
	 * THE NET IS SHOWN TO WHOLE RAND, per `amountText`'s own rule — 0 decimals on a screen
	 * summary, 2 on a line somebody approves — and the design prints it that way: "net effect on
	 * stock value −R8 000". The per-line effects in the table above carry their cents.
	 *
	 * AND A FIGURE THAT COULD NOT VALUE EVERYTHING SAYS SO. `uncostedNote` is rendered whenever a
	 * varying line has no recorded cost, because a total presenting itself as complete while
	 * quietly omitting a loss is worse than no total at all.
	 *
	 * THE ACTIONS ARE A SNIPPET, not props. One of them is a link and the other is a form that has
	 * to flush the autosave before it submits; a footer that owned both would have to know about
	 * the endpoint, the form action and the save state, none of which is layout.
	 */
	import { Amount } from '$lib/ui';
	import { countProgressLine, uncostedNote } from '$lib/core/inventory';
	import type { Money } from '$lib/core/money';
	import type { Snippet } from 'svelte';

	let {
		counted,
		total,
		net,
		uncosted = 0,
		promise = 'Saved automatically — leave and come back whenever.',
		actions
	}: {
		counted: number;
		total: number;
		/**
		 * Always a figure, never absent. `netValueEffect` sums an empty set to R0, and R0 is a
		 * true and useful statement — "nothing you have counted so far changes what your stock is
		 * worth" — which is exactly the sentence T20's rule about `Overdue 0` says to print rather
		 * than hide.
		 */
		net: Money;
		uncosted?: number;
		/** Overridable, because the review step stands on the same plinth and says something else. */
		promise?: string;
		actions: Snippet;
	} = $props();

	const caveat = $derived(uncostedNote(uncosted));
</script>

<div class="sticky bottom-0 z-10 border-t border-line-subtle bg-surface-sunken">
	<div
		class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3
			px-4 py-3 lg:px-8"
	>
		<div class="min-w-0">
			<p class="text-ui text-ink">{promise}</p>
			<p class="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-helper text-ink-muted">
				<span class="numeric">{countProgressLine(counted, total)}</span>
				<span aria-hidden="true">·</span>
				<span>net effect on stock value</span>
				<Amount value={net} class="text-helper text-ink-secondary" decimals={0} signed />
			</p>
			{#if caveat}
				<p class="mt-0.5 text-helper text-attention-ink">{caveat}</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	</div>
</div>
