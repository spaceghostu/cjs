<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn, type WithoutChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = 'default',
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: 'sm' | 'default';
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"flex w-fit items-center justify-between gap-1.5 rounded-md border border-line-control bg-surface-card py-2 pr-2 pl-3 text-ui whitespace-nowrap transition-colors duration-150 ease-out-forward outline-none select-none focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-ring-soft disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-wrong-border data-placeholder:text-ink-muted data-[size=default]:h-[38px] data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class="pointer-events-none size-4 text-muted-foreground" />
</SelectPrimitive.Trigger>
