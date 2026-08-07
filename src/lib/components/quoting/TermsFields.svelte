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
	import { Amount, Input, Label } from '$lib/ui';
	import { depositIssue, type EditorState, type QuotePrice } from '$lib/core/quoting';

	let {
		state = $bindable(),
		price,
		usualDays
	}: { state: EditorState; price: QuotePrice; usualDays: number } = $props();

	const problem = $derived(depositIssue(state.deposit));
</script>

<section>
	<h2 class="text-eyebrow text-ink-muted uppercase">Terms</h2>

	<div class="mt-3 grid gap-4 sm:grid-cols-2">
		<div>
			<Label for="quote-valid-until">Valid until</Label>
			<div class="mt-1.5">
				<!--
					A native date input. The design draws a plain field, and the platform's own
					picker is the one every person on every device already knows how to use — and
					the one that is accessible without a line of our code.
				-->
				<Input id="quote-valid-until" type="date" bind:value={state.validUntil} />
			</div>
			<p class="mt-1.5 text-helper text-ink-muted">
				Your usual {usualDays} days
			</p>
		</div>

		<div>
			<Label for="quote-deposit">Deposit</Label>
			<div class="mt-1.5 flex items-center gap-2">
				<Input
					id="quote-deposit"
					numeric
					class="w-24 text-right"
					inputmode="decimal"
					placeholder="50"
					aria-invalid={problem ? 'true' : undefined}
					aria-describedby="quote-deposit-help"
					bind:value={state.deposit.rate}
					oninput={() => {
						// Typing a number means "a percentage of the total"; clearing it means the
						// business is not asking for one. Neither needs a separate control.
						state.deposit.kind = state.deposit.rate.trim() === '' ? 'none' : 'rate';
					}}
				/>
				<span class="text-ui text-ink-secondary">% to start</span>
			</div>

			<p id="quote-deposit-help" class="mt-1.5 flex items-center gap-1 text-helper">
				{#if problem}
					<span class="text-wrong-ink">{problem}</span>
				{:else if price.deposit}
					<Amount value={price.deposit} size="sm" tone="muted" decimals={0} />
					<span class="text-ink-muted">on acceptance</span>
				{:else}
					<span class="text-ink-muted">No deposit asked for</span>
				{/if}
			</p>
		</div>
	</div>
</section>
