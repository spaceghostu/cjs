<script lang="ts">
	/**
	 * A FIELD THAT HOLDS A NUMBER SOMEBODY IS GOING TO BE CHARGED.
	 *
	 * `Field` with the decisions this product has already made about numerals baked in — mono
	 * and tabular, so the digits do not shift under the cursor while somebody types a price,
	 * and `inputmode="decimal"`, so a phone offers the keypad rather than the alphabet.
	 *
	 * Alignment is NOT one of them. A labelled field reads left like the label above it; it is
	 * a COLUMN of numbers that has to line up on the decimal, and a column is a table, which
	 * gets a bare `Input` and a row-level `FieldError` rather than a stack of labelled fields.
	 * `inputClass` is there for the field that turns out to be an exception.
	 *
	 * IT DOES NOT PARSE. THAT IS THE ENTIRE POINT.
	 * There is one parser in this codebase and it lives in `$lib/core/money`, where the space
	 * thousands separator, the comma decimal and the refusal to round "10.005" into a number
	 * nobody typed are decided and tested. A component that called `Number()` or split on a
	 * comma would be a second, worse parser sitting in the render path of an invoice. So the
	 * CALLER asks — `checkAmount`, `checkQuantity`, `checkUnitPrice`, `checkPercentage` from
	 * `$lib/core/validation`, or `parseMoneyInput` and friends directly — and hands the answer
	 * over whole:
	 *
	 *     const check = $derived(amount.trim() === '' ? null : checkAmount(amount));
	 *     <MoneyField label="Amount" name="amount" bind:value={amount} result={check} />
	 *
	 * THE BLANK GUARD BELONGS TO THE CALLER, NOT TO THIS COMPONENT.
	 * `parseMoneyInput('')` says "Enter an amount." — correct for a submitted form, wrong for a
	 * field nobody has typed in yet, and which of those an empty box is depends on whether the
	 * field is required and whether the person has started. `qtyIssue` in the quote editor drew
	 * that line at the call site before this component existed and it drew it right; a
	 * `showWhileEmpty` prop here would only move one screen's decision into a component shared
	 * by twelve.
	 *
	 * WHY THE CHECK RUNS WHILE THEY TYPE AT ALL.
	 * It is a COURTESY, in the validation core's word. The server checks again, always, and the
	 * document is priced from the server's answer. What the live check buys is that the person
	 * finds out about a stray letter in a price while they are still looking at the price,
	 * rather than after pressing Send — and, because nothing here writes back to `value`, the
	 * stray letter is still there for them to delete.
	 */
	import type { Snippet } from 'svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import Field from './Field.svelte';
	import type { FieldResult } from './field.js';

	let {
		label,
		labelHidden = false,
		id,
		name,
		value = $bindable(''),
		error = null,
		result = null,
		helper,
		placeholder,
		disabled = false,
		required = false,
		class: className,
		inputClass
	}: {
		label: string;
		labelHidden?: boolean;
		id?: string;
		/** Present when the value is posted; absent when the editor autosaves it instead. */
		name?: string;
		value?: string;
		/** A sentence the server already rendered, from `messagesByField()`. */
		error?: string | null;
		/** The money or validation core's answer about `value`. Never parsed here. */
		result?: FieldResult | null;
		helper?: string | Snippet;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		class?: string;
		inputClass?: string;
	} = $props();
</script>

<Field {label} {labelHidden} {id} {error} {result} {helper} {disabled} class={className}>
	{#snippet control(field)}
		<Input
			{...field}
			{name}
			{placeholder}
			{required}
			numeric
			inputmode="decimal"
			autocomplete="off"
			bind:value
			class={inputClass}
		/>
	{/snippet}
</Field>
