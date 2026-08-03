<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The frame every primitive story sits in.
	 *
	 * Stories render into a bare iframe, so without this a component is judged against
	 * whatever the browser defaults to rather than against the surface it will actually
	 * live on. `surface` picks which one — a dialog belongs on `overlay`, a table row on
	 * `card`.
	 */
	let {
		title,
		note,
		surface = 'base',
		children
	}: {
		title: string;
		note?: string;
		surface?: 'base' | 'card' | 'sunken';
		children: Snippet;
	} = $props();

	const backgrounds = {
		base: 'bg-surface-base',
		card: 'bg-surface-card',
		sunken: 'bg-surface-sunken'
	} as const;
</script>

<section class="min-h-svh {backgrounds[surface]} p-8">
	<h2 class="eyebrow">{title}</h2>
	{#if note}
		<p class="mt-1 mb-5 max-w-prose text-helper text-ink-muted">{note}</p>
	{:else}
		<div class="mb-5"></div>
	{/if}
	{@render children()}
</section>
