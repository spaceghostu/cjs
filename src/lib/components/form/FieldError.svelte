<script lang="ts">
	/**
	 * THE MESSAGE, AND THE ONLY PLACE IT IS DRAWN.
	 *
	 * `--state-wrong` at 12px, directly beneath the thing that is wrong. That is the whole of
	 * the design's primitives block on the subject and the whole of this component.
	 *
	 * IT IS SEPARATE FROM `Field` BECAUSE THE TABLES CANNOT USE `Field`.
	 * A quote line is a 68px quantity cell and a 108px price cell inside a four-column grid,
	 * and its message spans the row rather than sitting inside either column — that is the
	 * design's table, not a stack of labelled fields, and wrapping each cell in a field would
	 * turn a document you compose into a form you fill in. Same for a `<fieldset>` of colour
	 * swatches, whose caption is a `<legend>` and not a `<label>`. Those two places still get
	 * the same sentence in the same colour at the same size, because the paragraph they render
	 * is this one.
	 *
	 * THE COLOUR, AND THE SURFACES IT IS NOT GOOD ENOUGH ON.
	 * `--state-wrong` measured against the palette, worst theme first:
	 *
	 *     --surface-base     5.75    --surface-overlay   4.55
	 *     --surface-sunken   5.37    --surface-quiet     4.49   ✗
	 *     --surface-card     5.06    --surface-raised    4.20   ✗
	 *
	 * Base, sunken, card and overlay clear 4.5:1 in BOTH themes, and those are the four
	 * surfaces a form sits on — a page, a card, or a dialog. Raised and quiet are a selected
	 * row and a draft badge's fill; a form does not go there, and if one ever must, this
	 * paragraph is the thing to revisit rather than the assertion in
	 * `token-contrast.test.ts` that records it. That test measures the four, in both themes,
	 * so the claim is checked rather than asserted here in a comment.
	 *
	 * NO `aria-live`. The message is reached through `aria-describedby`, which is how a screen
	 * reader gets it on focus and on the way into a control the person is about to fix. A live
	 * region would instead read a half-typed amount's complaint out loud on every keystroke,
	 * which is the money editor's live courtesy check turned into a nuisance. Form-level
	 * refusals — the banner above the fields — are the ones that announce, and they already do.
	 */
	import { cn } from '$lib/utils.js';
	import { messageOf, type FieldResult } from './field.js';

	let {
		id,
		error = null,
		result = null,
		class: className
	}: {
		/** What `aria-describedby` on the control points at. */
		id?: string;
		/** A sentence the server already rendered, from `messagesByField()`. */
		error?: string | null;
		/** A `ParseResult` or `Checked` straight from the money or validation core. */
		result?: FieldResult | null;
		class?: string;
	} = $props();

	const message = $derived(messageOf(error, result));
</script>

{#if message}
	<p {id} class={cn('text-helper text-wrong', className)}>{message}</p>
{/if}
