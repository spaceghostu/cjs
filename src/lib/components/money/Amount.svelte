<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import type { Money } from '$lib/core/money';
	import { amountClass, amountText, type AmountSize, type AmountTone } from './amount.js';

	/**
	 * A `Money`, spelled the way the design spells money.
	 *
	 * Every rule the design states about numbers is in here once, so no screen has to
	 * remember them: mono, tabular, a real minus glyph, and colour only where colour means
	 * something.
	 */
	let {
		value,
		size = 'md',
		tone = 'default',
		signed = false,
		decimals = 2,
		symbol = true,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & {
		value: Money;
		size?: AmountSize;
		tone?: AmountTone;
		/** Render an explicit + or − — for a variance, not for a balance. */
		signed?: boolean;
		/** 0 on a screen summary, 2 on anything a customer receives. */
		decimals?: 2 | 0;
		symbol?: boolean;
		class?: string;
	} = $props();

	const text = $derived(amountText(value, { signed, decimals, symbol }));
</script>

<span data-slot="amount" class={cn(amountClass(size, tone), className)} {...restProps}>{text}</span>
