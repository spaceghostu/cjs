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
	 * WHY THE LAST ROW STAYS READABLE
	 * ------------------------------
	 * `sticky`, not `fixed`. A sticky element still occupies its place in the flow, so at the
	 * bottom of the scroll it comes to rest AFTER the last row rather than on top of it —
	 * there is no clearance padding to keep in sync with this component's height, and no way
	 * for the two to drift. Asserted at 390 × 844 in `shell.mobile.spec.ts`.
	 *
	 * It must therefore be the last child of the scrolling element, not a sibling of it.
	 */
	import { Button } from '$lib/ui';
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	let {
		href,
		onclick,
		disabled = false,
		class: className,
		children
	}: {
		href?: string;
		onclick?: () => void;
		disabled?: boolean;
		/**
		 * For the caller that needs to hide it on a wider screen. It has to land on THIS element
		 * rather than on a wrapper: a `sticky` child inside a wrapper only as tall as itself has
		 * nowhere to stick to, and would silently behave as though it were static.
		 */
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div class={cn('pointer-events-none sticky right-0 bottom-0 left-0 z-20', className)}>
	<div class="h-10 bg-gradient-to-b from-transparent to-surface-base"></div>
	<div class="pointer-events-auto bg-surface-base px-4 pb-3">
		<Button {href} {onclick} {disabled} size="mobile">{@render children()}</Button>
	</div>
</div>
