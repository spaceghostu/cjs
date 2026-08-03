<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The design's three input states, exactly:
	 *
	 *   Rest     --border-control, --surface-card, placeholder --text-muted
	 *   Focus    --brand border, 2px rgba(brand, .28) outline at 1px offset
	 *   Invalid  --state-wrong-border, message below in --state-wrong
	 *
	 * 38px tall, 8px radius. `numeric` puts the field in JetBrains Mono — every numeral in
	 * this product is mono and tabular, including the ones being typed.
	 */
	export const inputVariants = tv({
		base: [
			'flex h-[38px] w-full min-w-0 rounded-md px-3 text-ui',
			'border border-line-control bg-surface-card text-ink placeholder:text-ink-muted',
			'transition-colors duration-150 ease-out-forward',
			'outline-none focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-ring-soft',
			'aria-invalid:border-wrong-border',
			'disabled:pointer-events-none disabled:bg-surface-raised disabled:text-ink-muted',
			'file:inline-flex file:h-full file:border-0 file:bg-transparent file:pr-3 file:text-ui file:font-medium file:text-ink'
		],
		variants: {
			numeric: {
				true: 'numeric',
				false: ''
			}
		},
		defaultVariants: { numeric: false }
	});
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	> & {
		/** Mono and tabular. Set on any field that holds an amount, quantity or price. */
		numeric?: boolean;
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		numeric = false,
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(inputVariants({ numeric }), className)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(inputVariants({ numeric }), className)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
