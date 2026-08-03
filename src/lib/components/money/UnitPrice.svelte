<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import type { UnitPrice } from '$lib/core/money';
	import { unitPriceText } from './amount.js';

	/**
	 * A unit price, to as many decimals as it actually needs. R33,333333 prints in full,
	 * because a rate that was entered to six places is not the same number as R33,33.
	 */
	let {
		value,
		symbol = true,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & { value: UnitPrice; symbol?: boolean } = $props();
</script>

<span data-slot="unit-price" class={cn('numeric text-ui text-ink', className)} {...restProps}>
	{unitPriceText(value, { symbol })}
</span>
