<script lang="ts">
	/**
	 * THE REFUSAL BANNER. One tinted sentence, beside the work it is about.
	 *
	 * This is the rendering for everything that went wrong ON a screen rather than INSTEAD of
	 * one: a save that did not land, a quote whose email could not be sent, a payment reversal
	 * the server refused. The work stays exactly where it was — nothing here clears an input,
	 * navigates away, or replaces the page — because the sentence is a report on an attempt, not
	 * a verdict on the document.
	 *
	 * Before this existed the same class string was written out verbatim in seven files. That is
	 * precisely the drift `$lib/components/form/field.ts` documents for field errors, one layer
	 * up: four renderings of one idea, none of them wrong on its own, all of them drifting. This
	 * file is now the ONLY place outside the vendored `$lib/components/ui/**` where the string
	 * `bg-wrong-tint` appears — `ErrorState` composes this component rather than restating the
	 * classes, which is what keeps that true.
	 *
	 * `aria-live="polite"` AND NEVER `role="alert"`.
	 * All seven of the banners this replaces were polite, and they were right to be. This is the
	 * surface `FieldError` means when it says a field message deliberately carries no live region
	 * because "form-level refusals — the banner above the fields — are the ones that announce,
	 * and they already do". Exactly one polite region per surface: every caller DELETED its
	 * wrapping paragraph rather than nesting this inside it, so nothing is announced twice.
	 * `role="alert"` is assertive and fires on static render, which would interrupt somebody
	 * mid-keystroke to tell them about a panel that was already on the screen when they arrived.
	 * It is also one of the two reasons the shadcn registry's `Alert` was rejected for this job
	 * (the other being `AlertTitle`'s `line-clamp-1`, which truncates the long full sentences
	 * this product writes).
	 *
	 * THE COLOUR IS ALREADY PROVEN. `--state-wrong-ink` on `--state-wrong-tint`, over every
	 * surface and in both themes, is asserted by `it.each(PAIRS)` in
	 * `$lib/components/theme/token-contrast.test.ts`. That is why the text is drawn from the
	 * `-ink` token rather than from `--state-wrong`: `src/routes/layout.css` records the 4.16:1
	 * measurement that forced the split. No new contrast test is needed for this component.
	 *
	 * RETRY. When `onretry` is given, the sentence is followed by a button, and that is the whole
	 * of "offer a retry" — both autosave engines already put the failed payload back before they
	 * flip status, so retrying is a flush and nothing more. When it is absent, nothing extra is
	 * drawn: for a one-shot action the action's own button IS the retry, and a second one beside
	 * it would only raise the question of which one to press.
	 *
	 * MARGIN-FREE. Each caller passes the margin it already had — `mt-4`, `mt-3`, `mx-8 mt-4`,
	 * or none at all where a wrapper positions it.
	 *
	 * The `Button` is imported from the vendored directory by path rather than through `$lib/ui`,
	 * which is what `Field` and `MoneyField` do with `Label` and `Input` for the same reason:
	 * `$lib/ui` re-exports this component, and reaching back through it would be a cycle. Zone 2
	 * forbids that import from `src/routes/(app)/**` and `src/lib/modules/**`; this directory is
	 * neither, exactly as `$lib/components/form` is neither.
	 */
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		message,
		onretry,
		retryLabel = 'Try again',
		class: className
	}: {
		message: string;
		onretry?: () => void;
		retryLabel?: string;
		class?: string;
	} = $props();
</script>

<div
	data-slot="refusal"
	aria-live="polite"
	class={cn(
		'rounded-[10px] border border-wrong-border bg-wrong-tint px-4 py-3 text-ui text-wrong-ink',
		className
	)}
>
	{message}

	{#if onretry}
		<Button variant="secondary" class="mt-2 block" onclick={onretry}>{retryLabel}</Button>
	{/if}
</div>
