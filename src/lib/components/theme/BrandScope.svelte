<script lang="ts">
	import type { Snippet } from 'svelte';
	import { brandAttrs } from './brand.js';

	/**
	 * Applies a tenant's brand colour to everything inside it.
	 *
	 * Prefer spreading `brandAttrs()` onto an element you are already rendering — the app
	 * shell root does exactly that. This wrapper exists for the cases where there is no
	 * such element to hang it on: Storybook, previews, side-by-side comparisons.
	 *
	 * `display: contents` keeps the wrapper out of the box tree, so it cannot disturb a
	 * grid or flex layout it happens to sit inside.
	 */
	let { brand, children }: { brand?: unknown; children: Snippet } = $props();

	const attrs = $derived(brandAttrs(brand));
</script>

<div data-brand={attrs['data-brand']} style="display: contents; {attrs.style ?? ''}">
	{@render children()}
</div>
