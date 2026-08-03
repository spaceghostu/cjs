<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		'flex field-sizing-content min-h-16 w-full rounded-md border border-line-control bg-surface-card px-3 py-2 text-ui text-ink transition-colors duration-150 ease-out-forward outline-none placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-ring-soft disabled:pointer-events-none disabled:bg-surface-raised disabled:text-ink-muted aria-invalid:border-wrong-border',
		className
	)}
	bind:value
	{...restProps}></textarea>
