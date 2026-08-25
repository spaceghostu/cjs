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
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		Button,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		Field,
		Input,
		MoneyField,
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/ui';
	import { PAYMENT_METHODS, REVERSAL_WINDOW_DAYS, type PaymentMethod } from '$lib/core/invoicing';
	import { checkAmount } from '$lib/core/validation';
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

	// Re-defaulted whenever the dialog OPENS, so a reversal followed by a re-record does not
	// present the stale amount from the previous attempt.
	//
	// `outstanding` is read inside `untrack` deliberately: `open` is the only thing that may
	// re-seed this box. Tracking the amount owed as well would mean that any revalidation
	// landing while the dialog is up — some other action on the page calling `invalidateAll` —
	// silently replaces what the person has typed with the figure from the server. That is the
	// "never clear what they typed" rule losing to a refresh nobody asked for, and it is the
	// same shape as the guard in `ItemDialog`.
	$effect(() => {
		if (open) amount = untrack(() => moneyToDecimalString(outstanding));
	});

	/**
	 * The money core's answer about what is in the box, handed to the field whole.
	 *
	 * A courtesy, not the check — `?/recordPayment` parses it again with the same function and
	 * refuses on its own account. What this buys is that somebody who typed "R1 2OO" with a
	 * letter O finds out before pressing the button that records money against a client's
	 * account. An emptied box is left alone: `required` is what has something to say about that,
	 * and "Enter an amount." under a field the person has just cleared to retype is nagging.
	 */
	const check = $derived(amount.trim() === '' ? null : checkAmount(amount));
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
				<MoneyField
					label="Amount"
					id="payment-amount"
					name="amount"
					bind:value={amount}
					result={check}
					required
					helper="Defaults to the full balance. Change it if they paid part of it."
				/>

				<Field label="Date received" id="payment-date">
					{#snippet control(field)}
						<!-- The day the MONEY moved, not the day it is being typed in. -->
						<Input {...field} name="receivedOn" type="date" bind:value={receivedOn} required />
					{/snippet}
				</Field>

				<Field label="How" id="payment-method">
					{#snippet control(field)}
						<Select type="single" bind:value={method} name="method">
							<SelectTrigger {...field}>{LABELS[method]}</SelectTrigger>
							<SelectContent>
								{#each PAYMENT_METHODS as option (option)}
									<SelectItem value={option}>{LABELS[option]}</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{/snippet}
				</Field>

				<Field
					label="Reference"
					id="payment-reference"
					helper="Optional. Useful when you reconcile."
				>
					{#snippet control(field)}
						<Input
							{...field}
							name="reference"
							bind:value={reference}
							autocomplete="off"
							placeholder="What is on the statement"
						/>
					{/snippet}
				</Field>
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
