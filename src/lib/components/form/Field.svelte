<script lang="ts">
	/**
	 * ONE LABELLED FIELD: the caption, the control, and the one line underneath.
	 *
	 * THE CONTROL IS A SNIPPET, NOT A `type` PROP.
	 * A field in this product wraps an `Input`, a `Textarea`, a `SelectTrigger`, a native date
	 * picker, or an input with a `<datalist>` hung off it — five things with five different
	 * prop types, and a sixth arriving with every module. A wrapper that rendered the control
	 * itself would need a branch per kind and would be the wrong shape for whichever kind
	 * landed next; the version of this component that took `type="select"` could not have
	 * expressed the unit field in `ItemDialog`, which is a text input with suggestions and not
	 * a select at all. So the caller renders the control and this hands it the wiring:
	 *
	 *     <Field label="Business name" error={errors.tradingName}>
	 *         {#snippet control(field)}
	 *             <Input {...field} name="tradingName" value={values.tradingName} required />
	 *         {/snippet}
	 *     </Field>
	 *
	 * `{...field}` is an id, `aria-invalid`, `aria-describedby` and `disabled`. The border
	 * colour is not in there and never will be: the vendored controls already carry
	 * `aria-invalid:border-wrong-border`, so setting the attribute IS setting the border, and a
	 * second place that painted `#8A4A3F` would be a second place to get it wrong.
	 *
	 * THE MESSAGE REPLACES THE HELPER; IT DOES NOT JOIN IT.
	 * One 12px line lives under a field. When something is wrong, that line is what is wrong —
	 * "Leave blank if you are not VAT registered" is not the sentence somebody staring at a
	 * rejected VAT number needs, and stacking the two makes the field twice as tall at the
	 * exact moment the form is hardest to read. `aria-describedby` follows the swap, so the
	 * description a screen reader announces is the one actually on the screen.
	 *
	 * WHAT THIS COMPONENT WILL NOT DO IS CLEAR THE FIELD.
	 * It renders `value` and never assigns to it. That is not an omission — it is the third
	 * rule of the message standard, and the reason the form actions echo `values` back with
	 * their errors. Somebody who mistyped one character of a VAT number gets to fix that one
	 * character. See `$lib/core/validation`.
	 */
	import type { Snippet } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { cn } from '$lib/utils.js';
	import FieldError from './FieldError.svelte';
	import { fieldIds, messageOf, type FieldControl, type FieldResult } from './field.js';

	let {
		label,
		labelHidden = false,
		id,
		error = null,
		result = null,
		helper,
		disabled = false,
		class: className,
		control
	}: {
		/** The caption. Always present, even when `labelHidden` keeps it off the screen. */
		label: string;
		/**
		 * Off the screen, still in the accessibility tree. For a table of line items, where
		 * the column heading is the caption a sighted person reads.
		 */
		labelHidden?: boolean;
		/** Set it when something outside needs to point at the control; generated otherwise. */
		id?: string;
		/** A sentence the server already rendered, from `messagesByField()`. */
		error?: string | null;
		/** A `ParseResult` or `Checked` straight from the money or validation core. */
		result?: FieldResult | null;
		/** The quiet line beneath. A snippet where it needs to contain a rendered `Amount`. */
		helper?: string | Snippet;
		disabled?: boolean;
		class?: string;
		control: Snippet<[FieldControl]>;
	} = $props();

	const uid = $props.id();
	const ids = $derived(fieldIds(uid, id));
	const message = $derived(messageOf(error, result));

	const wiring = $derived<FieldControl>({
		id: ids.control,
		'aria-invalid': message ? 'true' : undefined,
		'aria-describedby': message ? ids.message : helper ? ids.helper : undefined,
		disabled: disabled || undefined
	});
</script>

<div
	class={cn('group flex min-w-0 flex-col gap-1.5', className)}
	data-disabled={disabled ? 'true' : undefined}
>
	<Label for={ids.control} class={labelHidden ? 'sr-only' : undefined}>{label}</Label>

	{@render control(wiring)}

	{#if message}
		<FieldError id={ids.message} error={message} />
	{:else if helper}
		<p id={ids.helper} class="flex items-center gap-1 text-helper text-ink-muted">
			{#if typeof helper === 'string'}
				{helper}
			{:else}
				{@render helper()}
			{/if}
		</p>
	{/if}
</div>
