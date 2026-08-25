<script lang="ts">
	/**
	 * "…WE'LL ASK YOU TO CONFIRM."
	 *
	 * The rail promises it in so many words — "Recording a payment can be undone for 30 days.
	 * Cancelling an invoice can't — we'll ask you to confirm." — and T19 and T21 both make it an
	 * acceptance criterion. A one-way door with a one-click handle is the exact failure the
	 * sentence exists to prevent.
	 *
	 * WHAT MAKES THIS A CONFIRMATION RATHER THAN A SPEED BUMP
	 * ------------------------------------------------------
	 * It names the document, states the consequence in the same words the screen behind it used,
	 * and says what to do instead. A dialog that only asked "Are you sure?" would be a click to
	 * be got past; this one is a sentence to be read.
	 *
	 * The reason field is optional and goes onto the record. Somebody looking at a cancelled
	 * invoice in eighteen months will want to know why, and the moment it is cheap to capture is
	 * this one.
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
		Field,
		Input
	} from '$lib/ui';

	let {
		open = $bindable(false),
		number,
		clientName
	}: {
		open?: boolean;
		number: string | null;
		clientName: string;
	} = $props();

	let reason = $state('');
	let busy = $state(false);
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-md">
		<form
			method="POST"
			action="?/cancel"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
					open = false;
				};
			}}
		>
			<DialogHeader>
				<DialogTitle>Cancel {number ?? 'this invoice'}?</DialogTitle>
				<DialogDescription>
					{clientName} will no longer owe it. This cannot be undone — a cancelled invoice stays on the
					record as cancelled, and billing again means a new invoice with a new number.
				</DialogDescription>
			</DialogHeader>

			<Field
				label="Why (optional)"
				id="cancel-reason"
				class="mt-4"
				helper="Goes onto the record, for whoever reads this in a year."
			>
				{#snippet control(field)}
					<Input
						{...field}
						name="reason"
						bind:value={reason}
						autocomplete="off"
						placeholder="Client changed their mind"
					/>
				{/snippet}
			</Field>

			<DialogFooter class="mt-5">
				<!-- The safe choice is the one that looks like a button; cancelling is the destructive one. -->
				<Button variant="secondary" type="button" onclick={() => (open = false)}>
					Keep the invoice
				</Button>
				<Button variant="destructive" type="submit" disabled={busy}>
					{busy ? 'Cancelling…' : 'Cancel it'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
