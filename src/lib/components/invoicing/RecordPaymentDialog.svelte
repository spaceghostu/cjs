<script lang="ts">
	/**
	 * RECORDING A PAYMENT.
	 *
	 * Amount, date, method, reference — and the amount DEFAULTS to the full outstanding balance,
	 * because that is what almost every payment is and typing it again is a chance to get it
	 * wrong.
	 *
	 * THE REVERSIBILITY IS STATED HERE TOO, not only on the screen behind the dialog. T21's rule
	 * is that "the interface states the consequence BEFORE the action, not in a dialog after it"
	 * — and the rail already says it — but somebody who opened this straight from a card on their
	 * phone has not read the rail, and the sentence costs one line.
	 *
	 * A REAL FORM POST, progressively enhanced. Recording money is the last thing in this product
	 * that should depend on JavaScript having loaded.
	 */
	import { enhance } from '$app/forms';
	import {
		Button,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		Input,
		Label,
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/ui';
	import { PAYMENT_METHODS, REVERSAL_WINDOW_DAYS, type PaymentMethod } from '$lib/core/invoicing';
	import { moneyToDecimalString } from '$lib/core/money';
	import type { Money } from '$lib/core/money';
	import type { CalendarDate } from '$lib/core/calendar';

	let {
		open = $bindable(false),
		outstanding,
		today,
		clientName,
		message = null
	}: {
		open?: boolean;
		outstanding: Money;
		today: CalendarDate;
		clientName: string;
		/** A refusal from the server, shown in the dialog that produced it. */
		message?: string | null;
	} = $props();

	/**
	 * The full balance and today's date, as a person would type them. Seeded ONCE and then owned
	 * by the form — re-seeding from a later prop would rewrite an amount somebody was halfway
	 * through correcting. The `$effect` below re-seeds deliberately, and only on open.
	 */
	// svelte-ignore state_referenced_locally
	let amount = $state(moneyToDecimalString(outstanding));
	// svelte-ignore state_referenced_locally
	let receivedOn = $state(today);
	let method = $state<PaymentMethod>('eft');
	let reference = $state('');
	let busy = $state(false);

	const LABELS: Readonly<Record<PaymentMethod, string>> = {
		eft: 'EFT',
		cash: 'Cash',
		card: 'Card',
		debit_order: 'Debit order',
		other: 'Something else'
	};

	// Re-defaulted whenever the dialog opens, so a reversal followed by a re-record does not
	// present the stale amount from the previous attempt.
	$effect(() => {
		if (open) amount = moneyToDecimalString(outstanding);
	});
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-md">
		<form
			method="POST"
			action="?/recordPayment"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<DialogHeader>
				<DialogTitle>Record a payment</DialogTitle>
				<DialogDescription>
					From {clientName}. This can be undone for {REVERSAL_WINDOW_DAYS} days.
				</DialogDescription>
			</DialogHeader>

			{#if message}
				<p class="mt-3 text-ui text-wrong-ink" aria-live="polite">{message}</p>
			{/if}

			<div class="mt-4 flex flex-col gap-4">
				<div>
					<Label for="payment-amount">Amount</Label>
					<div class="mt-1.5">
						<!--
							`inputmode="decimal"` so a phone offers the right keypad, and the value is
							parsed by `parseMoneyInput` on the server — never by `parseFloat`, which is
							import-banned for exactly this field.
						-->
						<Input
							id="payment-amount"
							name="amount"
							bind:value={amount}
							inputmode="decimal"
							autocomplete="off"
							required
						/>
					</div>
					<p class="mt-1.5 text-helper text-ink-muted">
						Defaults to the full balance. Change it if they paid part of it.
					</p>
				</div>

				<div>
					<Label for="payment-date">Date received</Label>
					<div class="mt-1.5">
						<!-- The day the MONEY moved, not the day it is being typed in. -->
						<Input
							id="payment-date"
							name="receivedOn"
							type="date"
							bind:value={receivedOn}
							required
						/>
					</div>
				</div>

				<div>
					<Label for="payment-method">How</Label>
					<div class="mt-1.5">
						<Select type="single" bind:value={method} name="method">
							<SelectTrigger id="payment-method">{LABELS[method]}</SelectTrigger>
							<SelectContent>
								{#each PAYMENT_METHODS as option (option)}
									<SelectItem value={option}>{LABELS[option]}</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div>
					<Label for="payment-reference">Reference</Label>
					<div class="mt-1.5">
						<Input
							id="payment-reference"
							name="reference"
							bind:value={reference}
							autocomplete="off"
							placeholder="What is on the statement"
						/>
					</div>
					<p class="mt-1.5 text-helper text-ink-muted">Optional. Useful when you reconcile.</p>
				</div>
			</div>

			<DialogFooter class="mt-5">
				<Button variant="secondary" type="button" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy}>
					{busy ? 'Recording…' : 'Record it'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
