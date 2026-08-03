<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn(
		'border-b border-line-row transition-colors duration-150 ease-out-forward hover:bg-surface-raised/50 data-[state=selected]:bg-surface-raised',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tr>
