/**
 * Number display. Wraps `$lib/core/money` and adds nothing but presentation.
 *
 * If you find yourself wanting to compute something here, it belongs in the core — that is
 * where the rounding policy is named and versioned, and where the tests are.
 */
export { default as Amount } from './Amount.svelte';
export { default as Blank, type BlankKind } from './Blank.svelte';
export { default as Qty } from './Qty.svelte';
export { default as StatDelta, type DeltaAccent } from './StatDelta.svelte';
export { default as UnitPrice } from './UnitPrice.svelte';
export {
	MINUS,
	PLUS,
	amountClass,
	amountText,
	qtyText,
	signedQtyText,
	unitPriceText,
	type AmountOptions,
	type AmountSize,
	type AmountTone
} from './amount.js';
