<script lang="ts" module>
	/**
	 * The two ways a number can be missing, which the design deliberately distinguishes.
	 *
	 *   unknown — there is no value. A draft with nothing priced yet. Renders "—".
	 *   none    — there IS a value and it is zero, and that is good news. Renders "None",
	 *             in words, as the design does for the "Overdue" summary stat.
	 *
	 * Rendering a meaningful zero as "R0" makes the owner read a figure and work out that
	 * it is fine; "None" tells them directly. Rendering an absent value as "R0" is simply
	 * a lie.
	 */
	export type BlankKind = 'unknown' | 'none';
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	let {
		kind = 'unknown',
		class: className,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & { kind?: BlankKind } = $props();
</script>

{#if kind === 'none'}
	<span data-slot="blank" class={cn('text-ui text-ink-muted', className)} {...restProps}>None</span>
{:else}
	<span data-slot="blank" class={cn('numeric text-ui text-ink-muted', className)} {...restProps}>
		<!--
			An em dash is announced as nothing useful, so the word goes alongside it rather
			than into an aria-label — which ARIA prohibits on a plain span anyway.
		-->
		<span aria-hidden="true">—</span>
		<span class="sr-only">Not priced yet</span>
	</span>
{/if}
