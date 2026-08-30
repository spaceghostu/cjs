<script module lang="ts">
	/**
	 * THE INVENTORY PICKER — the add-line row's "— or pick from Inventory".
	 *
	 * Under `Modules/` rather than `Primitives/`: it is a module surface built ON the command
	 * primitives, not one of them. Every story varies DATA — a stocked list, an unpriced item,
	 * an empty inventory — because those are the three states the quote editor can hand it.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor } from 'storybook/test';
	import InventoryPicker from '$lib/components/quoting/InventoryPicker.svelte';
	import { parseUnitPriceInput } from '$lib/core/money';
	import type { PickableItem } from '$lib/core/inventory';
	import Specimen from './Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Modules/Inventory picker',
		component: InventoryPicker,
		parameters: { layout: 'fullscreen' }
	});

	/** Money through the only door a non-test file has — ESLint zone 5 seals the constructor. */
	function price(input: string) {
		const parsed = parseUnitPriceInput(input);
		if (!parsed.ok) throw new Error(parsed.message);
		return parsed.value;
	}

	const STOCKED: readonly PickableItem[] = [
		{
			id: '5f0a3a52-0001-4a7e-9a2b-100000000001',
			name: 'European oak, 40mm',
			sku: null,
			unitOfMeasure: 'board',
			sellPrice: price('1780')
		},
		{
			id: '5f0a3a52-0002-4a7e-9a2b-100000000002',
			name: 'Hinge pair, brushed brass',
			sku: 'HNG-BB',
			unitOfMeasure: 'each',
			sellPrice: price('240')
		},
		{
			id: '5f0a3a52-0003-4a7e-9a2b-100000000003',
			name: 'Danish oil, 5L',
			sku: null,
			unitOfMeasure: 'litre',
			// "We have not recorded what this sells for" — a real state, rendered as a blank
			// and never as R0. Picking it leaves the price field for the person to type.
			sellPrice: null
		}
	];

	const onpick = fn();

	/** The pick-flow story's spy, minted fresh by its play run and read by its markup. */
	const picked = fn();
</script>

<!--
	Rendered CLOSED, trigger showing, because that is the state the row is in almost always —
	the play test on the pick-flow story below is what opens one.
-->
<Story name="Stocked" asChild>
	<Specimen
		title="Inventory picker"
		note="Prices are shown per the item's own unit; an unpriced item shows a blank, never R0."
	>
		<InventoryPicker items={STOCKED} {onpick} />
	</Specimen>
</Story>

<!--
	Owned but empty. The dialog still opens — a trigger that silently does nothing reads as
	broken — and points at the screen where the first item gets added.
-->
<Story name="Nothing in Inventory yet" asChild>
	<Specimen title="Inventory picker, empty" note="The dialog opens and points at /inventory.">
		<InventoryPicker items={[]} {onpick} />
	</Specimen>
</Story>

<!--
	The interaction the component exists for: open, search, pick. The assertion on the
	payload is the contract with `lineFromItem` — the WHOLE item comes back, so the caller
	can snapshot name, price and unit without a second lookup.
-->
<Story
	name="Picking hands back the item"
	asChild
	play={async ({ canvas }) => {
		picked.mockClear();

		const trigger = await canvas.getByRole('button', { name: 'pick from Inventory' });
		trigger.focus();
		await userEvent.keyboard('{Enter}');

		const input = await waitFor(() => {
			const element = document.querySelector<HTMLInputElement>('[data-slot="command-input"]');
			expect(element, 'the dialog never opened').not.toBeNull();
			return element!;
		});

		// The aria pairing bits-ui cannot make itself — the input must name the list it controls.
		expect(input.getAttribute('aria-controls')).toBe('inventory-picker-results');

		await userEvent.type(input, 'oak');
		await userEvent.keyboard('{Enter}');

		await waitFor(() => {
			expect(picked).toHaveBeenCalledTimes(1);
			expect(picked.mock.calls[0][0]).toMatchObject({
				name: 'European oak, 40mm',
				unitOfMeasure: 'board'
			});
			// Closed again, and focus handed back to the trigger for the next pick.
			expect(document.querySelector('[data-slot="command-input"]')).toBeNull();
			expect(document.activeElement).toBe(trigger);
		});
	}}
>
	<Specimen title="Pick" note="Open with Enter, type to filter, Enter to pick.">
		<InventoryPicker items={STOCKED} onpick={picked} />
	</Specimen>
</Story>
