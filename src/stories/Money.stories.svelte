<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import { parseMoneyInput, parseQuantityInput, parseUnitPriceInput } from '$lib/core/money';
	import type { Money, Quantity, UnitPrice } from '$lib/core/money';
	import MoneySpecimens from './money/MoneySpecimens.svelte';

	const { Story } = defineMeta({
		title: 'Foundations/Money',
		component: MoneySpecimens,
		parameters: { layout: 'fullscreen' }
	});

	/**
	 * A story has no database rows, and `money()` is off-limits outside the core — so the
	 * figures come in through `parseMoneyInput`, the same door a typed amount uses.
	 */
	const must = <T,>(result: { ok: true; value: T } | { ok: false; message: string }): T => {
		if (!result.ok) throw new Error(result.message);
		return result.value;
	};

	const R = (input: string): Money => must(parseMoneyInput(input));
	const Q = (input: string): Quantity => must(parseQuantityInput(input));
	const P = (input: string): UnitPrice => must(parseUnitPriceInput(input));

	const COLUMN = ['84200.00', '4600.00', '138900.50', '920.00', '0.05', '1250000.00'].map(R);
</script>

<!--
	The alignment story is the one that matters. Six amounts spanning five orders of
	magnitude, in one column: if the decimal marks do not form a straight line, either the
	font stopped being JetBrains Mono or `font-variant-numeric: tabular-nums` was lost, and
	both are invisible until someone reads a real invoice.
-->
<Story
	name="Money"
	args={{ column: COLUMN, qty: Q('2'), price: P('2300.00'), from: R('450'), to: R('570') }}
	play={async ({ canvas }) => {
		const cells = await canvas.findAllByTestId('aligned-amount');
		expect(cells.length).toBeGreaterThan(1);

		// Same right edge for every row, to the pixel: that IS decimal alignment for a
		// right-aligned tabular column.
		// eslint-disable-next-line no-restricted-syntax -- a CSS pixel offset is not money.
		const rights = cells.map((cell) => Math.round(cell.getBoundingClientRect().right));
		expect(new Set(rights).size).toBe(1);

		// And the glyphs really are mono — a proportional fallback would still line the
		// right edge up while destroying the alignment inside the number.
		expect(getComputedStyle(cells[0]).fontFamily).toContain('JetBrains Mono');
		expect(getComputedStyle(cells[0]).fontVariantNumeric).toContain('tabular-nums');
	}}
/>
