<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import type { Quantity } from '$lib/core/money';
	import { qtyText } from './amount.js';

	/** A quantity. Whole numbers stay whole — "3", never "3,000000". */
	let {
		value,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & { value: Quantity } = $props();
</script>

<span data-slot="qty" class={cn('numeric text-ui text-ink', className)} {...restProps}>
	{qtyText(value)}
</span>
