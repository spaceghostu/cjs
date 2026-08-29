<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * The design names four buttons and no more, so this offers four. shadcn's `outline`,
	 * `ghost` and `link` are gone deliberately: a closed set is what stops the twelfth
	 * module inventing a thirteenth button.
	 *
	 * Every state below is quoted from the design's "Primitives & states" block.
	 */
	export const buttonVariants = tv({
		base: [
			'group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none',
			'rounded-md text-ui font-medium',
			'transition-colors duration-150 ease-out-forward',
			// One ring, on every variant, in both themes: 2px --brand-focus-ring at 2px offset.
			'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring',
			'disabled:pointer-events-none aria-disabled:pointer-events-none',
			"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
		],
		variants: {
			variant: {
				primary: [
					'bg-brand text-ink-on-brand',
					'hover:bg-brand-hover active:bg-brand-active',
					'disabled:bg-surface-raised disabled:text-ink-muted',
					'aria-disabled:bg-surface-raised aria-disabled:text-ink-muted'
				],
				secondary: [
					'border border-line-strong bg-transparent text-ink',
					'hover:border-line-hover hover:bg-surface-overlay active:bg-surface-raised',
					'disabled:border-line-control disabled:text-ink-muted',
					'aria-disabled:border-line-control aria-disabled:text-ink-muted'
				],
				quiet: [
					'border border-transparent text-ink-secondary',
					'hover:bg-surface-raised hover:text-ink active:bg-surface-raised',
					'disabled:text-ink-muted aria-disabled:text-ink-muted'
				],
				destructive: [
					'border border-wrong-border-quiet bg-transparent text-wrong',
					'hover:bg-wrong-tint active:bg-wrong-tint',
					'disabled:border-line-control disabled:text-ink-muted',
					'aria-disabled:border-line-control aria-disabled:text-ink-muted'
				]
			},
			size: {
				// The design's control: 36px tall, 8px radius, 16px of horizontal padding.
				default: 'h-9 px-4',
				sm: 'h-8 px-3 text-[13px]',
				// 44px — the touch minimum, for a desktop control that also has to work on a phone.
				touch: 'h-11 px-5',
				// The design's mobile primary action: 50px, 12px radius, full width.
				mobile: 'h-[50px] w-full rounded-lg px-5',
				icon: 'size-9',
				'icon-sm': 'size-8',
				'icon-touch': 'size-11'
			}
		},
		defaultVariants: {
			variant: 'primary',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'primary',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
