<script lang="ts">
	/**
	 * "Payroll added — it's ready in People", and UNDO STAYS AVAILABLE.
	 *
	 * The design's toast is three things at once: a confirmation, a signpost to where the
	 * module actually is, and a way out. The third is the one that matters — a product that
	 * makes adding easy and undoing hard has not made adding easy, it has made a sale.
	 *
	 * THE WINDOW IS A DAY, AND IT IS NOT A COUNTDOWN.
	 * `undoAddition` in `modules/subscribe.ts` accepts the undo for the whole billing day, so
	 * closing this toast — or the tab, or the laptop — does not cost anybody the option:
	 * removing the module the same day is the same operation and charges the same nothing.
	 * There is deliberately no ticking clock here. ESLint zone 10 bans `setInterval` anywhere
	 * near billing, and manufactured urgency is exactly what that rule is for.
	 */
	import CheckIcon from '@lucide/svelte/icons/circle-check';
	import { enhance } from '$app/forms';

	let {
		label,
		/** Where the module lives now — "People", "Sales". The toast's signpost. */
		destination,
		/** "4 people and your tax settings" — generated, or null for a business with nothing yet. */
		carryover,
		subscriptionId,
		/** Called after Undo or Dismiss, so the caller can close the toast it opened. */
		onclose,
		action = '/settings/modules?/undo'
	}: {
		label: string;
		destination: string;
		carryover: string | null;
		subscriptionId: string;
		onclose: () => void;
		action?: string;
	} = $props();
</script>

<div
	class="flex w-full items-start gap-3 rounded-[10px] border border-line-strong bg-surface-overlay px-4 py-3.5 shadow-[0_12px_32px_rgba(0,0,0,.4)]"
>
	<CheckIcon size={18} aria-hidden="true" class="mt-0.5 shrink-0 text-settled" />

	<div class="min-w-0 flex-1">
		<p class="text-ui text-ink">{label} added — it's ready in {destination}</p>
		{#if carryover}
			<p class="mt-0.5 text-helper text-ink-muted">{carryover} came across</p>
		{/if}
	</div>

	<div class="flex shrink-0 items-center gap-3">
		<form
			method="POST"
			{action}
			use:enhance={() =>
				async ({ update }) => {
					await update();
					onclose();
				}}
		>
			<input type="hidden" name="subscriptionId" value={subscriptionId} />
			<!--
				A real button in `--brand` at 13/500, with the same weight the design gives it.
				Undo is not a quiet link in the corner: it is the affordance the whole toast
				exists for.
			-->
			<button
				type="submit"
				class="rounded-md text-[13px] font-medium text-brand-ink outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
			>
				Undo
			</button>
		</form>

		<!--
			Explicit dismissal, because the window is long. A toast that hangs about for a
			minute and cannot be got rid of is worse than one that vanishes.
		-->
		<button
			type="button"
			onclick={onclose}
			class="rounded-md text-[13px] text-ink-muted outline-none hover:text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
		>
			Dismiss
		</button>
	</div>
</div>
