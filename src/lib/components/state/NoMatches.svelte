<script lang="ts">
	/**
	 * A FILTER THAT MATCHED NOTHING. One sentence, no panel, and nothing offered.
	 *
	 * DELIBERATELY NOT A VARIANT OF `EmptyState`, and the precedent for that is one directory
	 * over: `RemovedModule` is not a variant of `LockedModule` either, for the reason its header
	 * gives — "the two states share a shape and share no words". Here it is the other way round
	 * and the argument is the same. A module with nothing in it and a tab with nothing under it
	 * are not the same state, and the difference is structural rather than cosmetic: the first
	 * needs a way out of itself, the second needs nothing at all. Offering "New item" beneath an
	 * empty "Running low" tab is the interface misreading good news as a lack.
	 *
	 * So this component takes no action snippet and never will. A `variant` prop on `EmptyState`
	 * would move that decision back to the call site, which is exactly where it drifted from in
	 * the first place — three screens, three slightly different renderings of one idea.
	 *
	 * MARGIN-FREE, like every primitive here. The list screens pass `class="mt-8"`.
	 */
	import { cn } from '$lib/utils.js';

	let { message, class: className }: { message: string; class?: string } = $props();
</script>

<p data-slot="no-matches" class={cn('text-ui text-ink-secondary', className)}>{message}</p>
