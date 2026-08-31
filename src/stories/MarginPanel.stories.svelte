<script module lang="ts">
	/**
	 * THE MARGIN PANEL'S SIX FACES — SPA-9.
	 *
	 * Every story below varies DATA through the same `marginPanel` the server calls, so each
	 * sentence on screen is production copy and never an imitation. The one to read slowly is
	 * "Labour at what was charged": an invoice raised from a quote whose lines were all typed
	 * by hand shows Labour equal to the whole subtotal and keeps exactly R0,00 — the arithmetic
	 * being honest about a business that recorded no costs, with the sentence that says so.
	 * That story IS the sign-off artefact for the charge-basis decision (Q5, 17 Aug 2026).
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MarginPanel from '$lib/components/invoicing/MarginPanel.svelte';
	import { marginPanel } from '$lib/core/invoicing';
	import { parseMoneyInput, type Money } from '$lib/core/money';
	import Specimen from './ui/Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Invoicing/Margin panel',
		component: MarginPanel,
		parameters: { layout: 'fullscreen' }
	});

	/** Money through the only door a non-test file has — ESLint keeps the constructor out. */
	function money(input: string): Money {
		const parsed = parseMoneyInput(input);
		if (!parsed.ok) throw new Error(parsed.message);
		return parsed.value;
	}

	const REVENUE = money('21000.00');
	const WORKINGS = '/invoicing/inv-1042/workings';

	/** Every cost known: materials from Inventory, labour recorded by hand. Nothing to explain. */
	const EXACT = marginPanel({
		revenue: REVENUE,
		costs: [
			{ kind: 'materials', amount: money('8130.00') },
			{ kind: 'labour', amount: money('4500.00') }
		],
		totalLines: 3,
		costedLines: 3,
		inventoryOwned: true,
		chargedLabourLines: 0
	});

	/** Every line hand-typed on the quote, so every line is costed at its charge: keep R0,00. */
	const ALL_CHARGED = marginPanel({
		revenue: REVENUE,
		costs: [{ kind: 'labour', amount: money('21000.00') }],
		totalLines: 3,
		costedLines: 3,
		inventoryOwned: true,
		chargedLabourLines: 3
	});

	/** Charged labour beside a picked line whose cost nobody recorded: both sentences show. */
	const MIXED = marginPanel({
		revenue: REVENUE,
		costs: [{ kind: 'labour', amount: money('14000.00') }],
		totalLines: 3,
		costedLines: 2,
		inventoryOwned: true,
		chargedLabourLines: 2
	});

	/** Only some materials costed, no charges anywhere: the caveat alone. */
	const PARTIAL = marginPanel({
		revenue: REVENUE,
		costs: [{ kind: 'materials', amount: money('8130.00') }],
		totalLines: 3,
		costedLines: 1,
		inventoryOwned: true,
		chargedLabourLines: 0
	});

	/** Nothing known, no Inventory: the one case with an obvious next step. */
	const UNKNOWN_NO_INVENTORY = marginPanel({
		revenue: REVENUE,
		costs: [],
		totalLines: 3,
		costedLines: 0,
		inventoryOwned: false,
		chargedLabourLines: 0
	});

	/** Nothing known despite owning Inventory: a different problem, different words. */
	const UNKNOWN_OWNS_INVENTORY = marginPanel({
		revenue: REVENUE,
		costs: [],
		totalLines: 3,
		costedLines: 0,
		inventoryOwned: true,
		chargedLabourLines: 0
	});
</script>

<Story name="Exact" asChild>
	<Specimen
		title="Margin panel"
		note="Every cost known — materials from Inventory, labour recorded. No caveat, no note."
	>
		<div class="max-w-sm">
			<MarginPanel panel={EXACT} fromInventory workingsHref={WORKINGS} />
		</div>
	</Specimen>
</Story>

<Story name="Labour at what was charged" asChild>
	<Specimen
		title="Margin panel"
		note="A from-quote invoice with no picked lines: labour is the whole subtotal, keep is exactly R0,00, and the muted sentence says what the figure is. This is the charge-basis decision on screen."
	>
		<div class="max-w-sm">
			<MarginPanel panel={ALL_CHARGED} fromInventory={false} workingsHref={WORKINGS} />
		</div>
	</Specimen>
</Story>

<Story name="Charged labour beside an unknown cost" asChild>
	<Specimen
		title="Margin panel"
		note="Hand-typed lines costed at charge, one picked line with no cost recorded. The labour note and the upper-bound caveat stand together, muted and amber respectively."
	>
		<div class="max-w-sm">
			<MarginPanel panel={MIXED} fromInventory={false} workingsHref={WORKINGS} />
		</div>
	</Specimen>
</Story>

<Story name="Partly known" asChild>
	<Specimen
		title="Margin panel"
		note="Some materials costed, nothing charged: the caveat alone, and the figure is an upper bound."
	>
		<div class="max-w-sm">
			<MarginPanel panel={PARTIAL} fromInventory workingsHref={WORKINGS} />
		</div>
	</Specimen>
</Story>

<Story name="Unknown · no Inventory" asChild>
	<Specimen
		title="Margin panel"
		note="No figures, the reason, and the one offer this product makes calmly."
	>
		<div class="max-w-sm">
			<MarginPanel panel={UNKNOWN_NO_INVENTORY} fromInventory={false} workingsHref={WORKINGS} />
		</div>
	</Specimen>
</Story>

<Story name="Unknown · owns Inventory" asChild>
	<Specimen
		title="Margin panel"
		note="The same absence for a business that already pays for Inventory — told what happened, not sold a module."
	>
		<div class="max-w-sm">
			<MarginPanel panel={UNKNOWN_OWNS_INVENTORY} fromInventory={false} workingsHref={WORKINGS} />
		</div>
	</Specimen>
</Story>
