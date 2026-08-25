<script lang="ts">
	/**
	 * THE STEPPER. The template for every multi-step flow this platform will grow.
	 *
	 * It lands in `$lib/components/flow` rather than in `$lib/components/inventory` because the
	 * stock count is the first of these, not the only one: T24 calls it "the pattern-setter" and
	 * names the flows that come after it — pay runs, VAT returns, bank reconciliation. Every one
	 * of those is the same promise ("progress is visible, nothing commits until reviewed, and it's
	 * interruptible") wearing different nouns. A stepper that lived inside Inventory would be
	 * re-derived four times, and the fourth one would look nothing like the first.
	 *
	 * THREE MARKERS, AND EACH ONE MEANS SOMETHING DIFFERENT
	 * ----------------------------------------------------
	 *   done     a settled-green tick on its own tint. Not a number — a number that has already
	 *            happened is just a number, and the tick is what says "you do not have to go back
	 *            there".
	 *   current  a filled `--brand` circle with a white mono numeral. The only filled circle on
	 *            the row, so where you are is findable without reading a word.
	 *   ahead    outlined in `--border-strong` with `--text-muted` figures. Present, legible, and
	 *            visibly not yet yours.
	 *
	 * THE LABELS ARE THE CALLER'S, AND THEY ARE VERBS. "Update stock", not "Commit". A stepper is
	 * the one place an application tells somebody what is about to happen to them, so the words
	 * belong to the flow rather than to this component — but the design's rule about them is worth
	 * repeating here, because this is the file the next flow's author will open.
	 *
	 * COLOUR IS NEVER THE ONLY SIGNAL (T27 §6). The tick is a shape, the numeral is a numeral, and
	 * every marker carries a visually-hidden word — "Done", "You are here", "Still to come" — so
	 * the row survives greyscale and reads correctly out loud. `aria-current="step"` is what a
	 * screen reader announces on the way past; the hidden words are what make the other two states
	 * legible, because ARIA has no attribute for "already finished".
	 *
	 * AN `<ol>`, NOT A ROW OF `<div>`s. Four steps in a fixed order is a numbered list, and the
	 * markup should say so before any CSS does.
	 */
	import Check from '@lucide/svelte/icons/check';
	import { cn } from '$lib/utils.js';

	let {
		steps,
		current,
		label = 'Progress through this flow',
		class: className
	}: {
		/** The verb for each step, in order. */
		steps: readonly string[];
		/** Which step the person is on, counting from 1. */
		current: number;
		/** What a screen reader calls the list. Name the flow: "Stock count progress". */
		label?: string;
		class?: string;
	} = $props();

	type Marker = 'done' | 'current' | 'ahead';

	function markerOf(index: number): Marker {
		const step = index + 1;
		if (step < current) return 'done';
		return step === current ? 'current' : 'ahead';
	}

	/** Said out loud, so the state does not depend on a colour or a glyph. */
	const SAID: Record<Marker, string> = {
		done: 'Done',
		current: 'You are here',
		ahead: 'Still to come'
	};
</script>

<ol
	data-slot="stepper"
	aria-label={label}
	class={cn('flex flex-wrap items-center gap-y-3', className)}
>
	<!--
		KEYED BY POSITION, NOT BY LABEL, and this is the reusable component so the reason belongs
		in the file rather than in the flow that noticed it. The labels are the CALLER'S prose —
		"Update stock", "Approve", "Send" — and nothing stops a future flow from wearing the same
		verb twice: a VAT return that reviews, files and then reviews again is an ordinary shape.
		Two identical keys in one keyed `{#each}` is a runtime error in Svelte, and the flow that
		hits it would be four flows from here with nobody left who remembers this decision.

		Keying by index is not the usual compromise it looks like either. A key exists so state
		can follow a moving item, and nothing here moves: `current` is a fixed 1-based POSITION,
		the list is a fixed order, and the markers are derived from the index they sit at. Index
		is the identity of a step in this component, so it is the correct key rather than the
		convenient one.
	-->
	{#each steps as step, i (i)}
		{@const marker = markerOf(i)}
		<li class="flex items-center">
			{#if i > 0}
				<!--
					The 56px rule between two markers. Decoration, and announced as nothing: the
					order is already carried by the list itself.
				-->
				<span class="mx-3 h-px w-14 shrink bg-line-control" aria-hidden="true"></span>
			{/if}

			<span
				class="flex items-center gap-2"
				aria-current={marker === 'current' ? 'step' : undefined}
			>
				{#if marker === 'done'}
					<span
						class="flex size-5 shrink-0 items-center justify-center rounded-full bg-settled-tint"
					>
						<Check size={12} strokeWidth={3} class="text-settled" aria-hidden="true" />
					</span>
				{:else if marker === 'current'}
					<span
						class="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand
							numeric text-[11px] leading-none text-ink-on-brand"
					>
						{i + 1}
					</span>
				{:else}
					<span
						class="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong
							numeric text-[11px] leading-none text-ink-muted"
					>
						{i + 1}
					</span>
				{/if}

				<span class="sr-only">{SAID[marker]}:</span>
				<span
					class={cn(
						'text-ui whitespace-nowrap',
						marker === 'ahead' ? 'text-ink-muted' : 'text-ink'
					)}
				>
					{step}
				</span>
			</span>
		</li>
	{/each}
</ol>
