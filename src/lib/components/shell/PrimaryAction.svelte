<script lang="ts">
	/**
	 * The one obvious action, in the thumb zone.
	 *
	 * 50px tall, 12px radius, full width, `--brand` — the `mobile` button size from T02. What
	 * this component adds is the gradient fade beneath it: content scrolling under a floating
	 * button collides with it, and the design's answer is a fade to `--surface-base` rather
	 * than a hard edge.
	 *
	 * The fade is `pointer-events-none` and the container is not, so the strip above the
	 * button never eats a tap meant for the row underneath it.
	 *
	 * WHAT IT DOES NOT DO
	 * -------------------
	 * Guarantee the last row is reachable. That is `pb-[calc(...)]` on the scrolling content,
	 * which is why `PRIMARY_ACTION_CLEARANCE` is exported rather than hardcoded in two places
	 * that could drift.
	 */
	import { Button } from '$lib/ui';
	import type { Snippet } from 'svelte';

	let {
		href,
		onclick,
		children
	}: {
		href?: string;
		onclick?: () => void;
		children: Snippet;
	} = $props();
</script>

<div class="pointer-events-none sticky right-0 bottom-0 left-0 z-20">
	<div class="h-10 bg-gradient-to-b from-transparent to-surface-base"></div>
	<div class="pointer-events-auto bg-surface-base px-4 pb-3">
		<Button {href} {onclick} size="mobile">{@render children()}</Button>
	</div>
</div>
