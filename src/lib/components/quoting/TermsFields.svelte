<script lang="ts">
	/**
	 * "TERMS."
	 *
	 * Two fields. "Valid until", with the helper "Your usual 14 days" — the business's own
	 * default, not the product's, which is why it is a number from `quoting_setting` and not a
	 * constant in this file. And "Deposit", with the computed amount as helper: "R24 380 on
	 * acceptance".
	 *
	 * THE HELPER RECOMPUTES LIVE. It is the same `priceQuote` result the totals column and the
	 * preview use, so a line typed above changes all three in the same frame. A deposit helper
	 * that lagged the total would be the product disagreeing with itself about what the client
	 * owes.
	 */
	import { Amount, Field, Input } from '$lib/ui';
	import { checkPercentage } from '$lib/core/validation';
	import type { EditorState, QuotePrice } from '$lib/core/quoting';

	let {
		state = $bindable(),
		price,
		usualDays
	}: { state: EditorState; price: QuotePrice; usualDays: number } = $props();

	/**
	 * The rate as the money core reads it, handed to the field whole rather than reduced to a
	 * string here. `kind === 'none'` is what a cleared box means and is not a complaint; the
	 * `amount` kind is unreachable from this control, which offers a percentage and nothing
	 * else.
	 */
	const check = $derived(
		state.deposit.kind === 'rate' && state.deposit.rate.trim() !== ''
			? checkPercentage(state.deposit.rate)
			: null
	);
</script>

<section>
	<h2 class="text-eyebrow text-ink-muted uppercase">Terms</h2>

	<div class="mt-3 grid gap-4 sm:grid-cols-2">
		<Field label="Valid until" id="quote-valid-until" helper="Your usual {usualDays} days">
			{#snippet control(field)}
				<!--
					A native date input. The design draws a plain field, and the platform's own
					picker is the one every person on every device already knows how to use — and
					the one that is accessible without a line of our code.
				-->
				<Input {...field} type="date" bind:value={state.validUntil} />
			{/snippet}
		</Field>

		<Field label="Deposit" id="quote-deposit" result={check}>
			{#snippet control(field)}
				<div class="flex items-center gap-2">
					<Input
						{...field}
						numeric
						class="w-24 text-right"
						inputmode="decimal"
						placeholder="50"
						bind:value={state.deposit.rate}
						oninput={() => {
							// Typing a number means "a percentage of the total"; clearing it means the
							// business is not asking for one. Neither needs a separate control.
							state.deposit.kind = state.deposit.rate.trim() === '' ? 'none' : 'rate';
						}}
					/>
					<span class="text-ui text-ink-secondary">% to start</span>
				</div>
			{/snippet}

			<!--
				The helper is a rendered `Amount`, not a string — which is why `Field` takes a
				snippet for it. A deposit that said "R24 380" as text would be the one number on
				this screen not spelled the way the product spells money.
			-->
			{#snippet helper()}
				{#if price.deposit}
					<Amount value={price.deposit} size="sm" tone="muted" decimals={0} />
					<span class="text-ink-muted">on acceptance</span>
				{:else}
					<span class="text-ink-muted">No deposit asked for</span>
				{/if}
			{/snippet}
		</Field>
	</div>
</section>
