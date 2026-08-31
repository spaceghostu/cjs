<script lang="ts">
	/**
	 * NOTHING HERE YET — AND NOTHING HAS GONE WRONG.
	 *
	 * The panel a module shows when the business has never put anything in it. It is calm by
	 * construction: no state colour, no tint, no `role="alert"`, no live region. An empty module
	 * is not a failure and the interface should not dress it as one; what it needs is a way out
	 * of itself, and that is the `action` snippet.
	 *
	 * THE GEOMETRY IS `LockedModule`'s, TO THE PIXEL — `flex flex-col items-start gap-2.5
	 * rounded-[10px] border border-line-default bg-surface-card p-7`, an icon at 22/1.75 in the
	 * module's accent, a 16px heading, a 13px body capped at `max-w-95`. That is not tidiness:
	 * the three things a module screen can say when it has nothing to show — you never added
	 * this, you removed this, you have not filled it in yet — arrive on the same page in the
	 * same place, and three shapes for one moment would read as three different kinds of news.
	 *
	 * WHY THIS IS HAND-WRITTEN RATHER THAN THE SHADCN REGISTRY'S `Empty`.
	 * That component was fetched and read before this one was written. It is centred where this
	 * is left-aligned, dashed where this is solid, background-less where this sits on
	 * `--surface-card`, `text-lg`/`gap-6`/`md:p-12` where this is `text-[16px]`/`gap-2.5`/`p-7`.
	 * Every axis of the house panel is contradicted, and overriding all of them would leave
	 * nothing of the registry component except nested divs. Recorded here so nobody re-litigates
	 * it in six months and concludes the omission was an oversight.
	 *
	 * MARGIN-FREE. The spacing belongs to the caller, exactly as it does for `LockedModule` and
	 * `RemovedModule` — which is the only reason those two compose into four different page
	 * containers without a variant prop. Every list screen passes `class="mt-8"`.
	 *
	 * AND THE HEADING LEVEL BELONGS TO THE CALLER TOO, for the same reason the margin does. On a
	 * list screen this panel sits under the page's own `<h1>` and `h2` is correct. On the two
	 * `+error.svelte` files it is the ONLY heading the document has, and an `h2` with no `h1`
	 * above it is a level skip — the whole page announcing itself as a subsection of nothing. So
	 * the level is a prop rather than a fact of the component, defaulting to the common case.
	 */
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	let {
		heading,
		headingLevel = 2,
		body,
		/** A lucide icon, drawn in `accentClass` — the module's own colour, never a state colour. */
		icon: Icon,
		accentClass = 'text-ink-secondary',
		action,
		class: className
	}: {
		heading: string;
		/** `1` when this panel IS the page, as on an error boundary. `2` under a page's own h1. */
		headingLevel?: 1 | 2;
		body: string;
		icon?: LucideIcon;
		accentClass?: string;
		action?: Snippet;
		class?: string;
	} = $props();
</script>

<div
	data-slot="empty-state"
	class={cn(
		'flex flex-col items-start gap-2.5 rounded-[10px] border border-line-default bg-surface-card p-7',
		className
	)}
>
	{#if Icon}
		<Icon size={22} strokeWidth={1.75} class={accentClass} aria-hidden="true" />
	{/if}

	<svelte:element this={`h${headingLevel}`} class="text-[16px] leading-snug text-ink">
		{heading}
	</svelte:element>

	<p class="max-w-95 text-[13px] leading-relaxed text-ink-secondary">{body}</p>

	{#if action}
		<div class="mt-1.5">{@render action()}</div>
	{/if}
</div>
