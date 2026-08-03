<script lang="ts" module>
	/**
	 * Which accent the new figure is drawn in. The module the change belongs to — adding
	 * Invoicing colours the number with Invoicing's accent — so the confirmation says what
	 * changed without a sentence.
	 */
	export type DeltaAccent =
		'brand' | 'quoting' | 'invoicing' | 'inventory' | 'payroll' | 'expenses' | 'bookings';
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Money } from '$lib/core/money';
	import { amountText } from './amount.js';

	/**
	 * The "R450 → R570" pattern from the add-module confirmation.
	 *
	 * The old figure stays visible and quiet, the new one is large and coloured, and the
	 * unit label is in words. The design's point is that the owner should never have to
	 * work out what a price change means — they should be able to see it.
	 */
	let {
		from,
		to,
		unit,
		accent = 'brand',
		class: className
	}: {
		from: Money;
		to: Money;
		/** Plain language, in Inter. "a month", "per invoice". */
		unit: string;
		accent?: DeltaAccent;
		class?: string;
	} = $props();

	const INK: Record<DeltaAccent, string> = {
		brand: 'text-brand-ink',
		quoting: 'text-quoting-ink',
		invoicing: 'text-invoicing-ink',
		inventory: 'text-inventory-ink',
		payroll: 'text-payroll-ink',
		expenses: 'text-expenses-ink',
		bookings: 'text-bookings-ink'
	};

	// Screen figures, so whole rand. A price change is never quoted to the cent on a card.
	const before = $derived(amountText(from, { decimals: 0 }));
	const after = $derived(amountText(to, { decimals: 0 }));
</script>

<p data-slot="stat-delta" class={cn('flex flex-wrap items-baseline gap-2', className)}>
	<span class="numeric text-[20px] text-ink-muted">{before}</span>
	<span class="text-[20px] text-ink-muted" aria-hidden="true">→</span>
	<span class="numeric text-[32px] leading-[1.15] tracking-[-0.02em] {INK[accent]}">{after}</span>
	<span class="text-ui text-ink-secondary">{unit}</span>
</p>
