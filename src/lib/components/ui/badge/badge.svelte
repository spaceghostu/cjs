<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	/**
	 * The design's six status badges. Named by what they MEAN, not by the words they happen
	 * to carry — "Due in 3 days" and "Due in 12 days" are one badge.
	 *
	 * All six: 12px, 5px radius, 4px/9px padding. Semantic fills are the state colour at
	 * 15% alpha; `sent` and `draft` are deliberately colourless, because neither is a state
	 * worth spending colour on.
	 */
	export const badgeVariants = tv({
		base: [
			'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap',
			'rounded-[5px] px-2.25 py-1 text-helper font-medium',
			'[&>svg]:pointer-events-none [&>svg]:size-3'
		],
		variants: {
			variant: {
				/** Paid, all-clear, matched. */
				settled: 'bg-settled-tint text-settled-ink',
				/** Sent — gone out, nothing owed yet. */
				sent: 'bg-surface-raised text-ink-secondary',
				/** Due in N days. */
				attention: 'bg-attention-tint text-attention-ink',
				/** Overdue. */
				wrong: 'bg-wrong-tint text-wrong-ink',
				/** Draft — not yet anything. */
				draft: 'bg-surface-quiet text-ink-muted',
				/** "Drafted for you · check it" — the product did the work, the owner confirms it. */
				assisted: 'bg-quoting-tint text-quoting-ink'
			}
		},
		defaultVariants: {
			variant: 'draft'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'draft',
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
