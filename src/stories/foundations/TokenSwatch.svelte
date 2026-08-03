<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { contrastRatio } from '$lib/core/color/contrast.js';

	/**
	 * One token, with the value it actually resolves to right now.
	 *
	 * Reading the value back off the DOM rather than printing a literal is the point: this
	 * page is a check on `layout.css`, not a second copy of it.
	 */
	let {
		token,
		role,
		against
	}: {
		token: string;
		role: string;
		/** Optional surface token to measure the contrast ratio against. */
		against?: string;
	} = $props();

	let value = $state('');
	let backdrop = $state('');

	const isHex = (candidate: string) => /^#[0-9a-f]{3,8}$/i.test(candidate);

	// A WCAG ratio is not an amount, so the money-rounding rule does not apply. It is
	// display-only and never feeds a calculation.
	// eslint-disable-next-line no-restricted-syntax
	const toTwoPlaces = (ratio: number) => ratio.toFixed(2);

	// Tints resolve to a `color-mix(...)` expression rather than a hex, and there is
	// nothing honest to measure there — so the ratio is simply omitted.
	const ratio = $derived(
		isHex(value) && isHex(backdrop) ? toTwoPlaces(contrastRatio(value, backdrop)) : ''
	);

	/** Computed custom properties only exist on a mounted node, so this cannot be $derived. */
	const readComputedValues: Attachment<HTMLElement> = (node) => {
		const styles = getComputedStyle(node);
		value = styles.getPropertyValue(token).trim();
		backdrop = against ? styles.getPropertyValue(against).trim() : '';
	};
</script>

<div class="flex items-center gap-3" {@attach readComputedValues}>
	<span
		class="size-9 shrink-0 rounded-md border border-line-strong"
		style="background: var({token})"
	></span>
	<span class="min-w-0">
		<span class="block truncate numeric text-[13px] text-ink">{token}</span>
		<span class="block truncate text-helper text-ink-muted">{role}</span>
	</span>
	<span class="ml-auto shrink-0 text-right numeric text-[11px] text-ink-muted">
		{value}
		{#if ratio}
			<span class="block">{ratio}:1</span>
		{/if}
	</span>
</div>
