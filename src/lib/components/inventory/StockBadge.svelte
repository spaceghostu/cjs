<script lang="ts">
	/**
	 * ONE ITEM'S STOCK STATE, IN WORDS.
	 *
	 * Every rule about what this says and what colour it earns lives in
	 * `$lib/core/inventory/copy.ts`, which is pure and unit-tested — so "Running low" cannot be
	 * spelled one way in the table and another on a card, and so the wording is asserted by a
	 * test rather than reviewed by eye once.
	 *
	 * THE WORDS ARE THE SIGNAL, not the colour. T27 §6 requires the meaning to survive with
	 * colour removed, and a `Badge` carrying text does that on its own; the tone only reinforces
	 * what the text already said. The row states the quantity against its reorder point as well,
	 * so there are two colour-free carriers, not one.
	 */
	import { Badge } from '$lib/ui';
	import { stockCopy, type InventoryItem } from '$lib/core/inventory';
	import type { Quantity } from '$lib/core/money';

	let { item, onHand }: { item: InventoryItem; onHand: Quantity } = $props();

	const copy = $derived(stockCopy(item, onHand));
</script>

<Badge variant={copy.tone}>{copy.text}</Badge>
