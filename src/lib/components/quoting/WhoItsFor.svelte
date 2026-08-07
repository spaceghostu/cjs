<script lang="ts">
	/**
	 * "WHO IT'S FOR."
	 *
	 * A two-column grid: a Client select at 38px with a chevron, and a Send-to field. Below, at
	 * 12px:
	 *
	 *   "Filled in from your customer list. Change it here and we'll ask if you want it saved."
	 *
	 * That sentence is a contract with two halves and the editor keeps both. Editing here writes
	 * to the QUOTE — `core_customer` is untouched — and the ask happens when the person leaves,
	 * through `SaveBackDialog`. Neither half works without the other: silent local edits would
	 * make the address book slowly wrong, and silent write-back would let a one-off correction
	 * on one document rewrite every other one.
	 */
	import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger } from '$lib/ui';
	import type { EditorState } from '$lib/core/quoting';

	let {
		state = $bindable(),
		customers,
		onclientchange
	}: {
		state: EditorState;
		customers: readonly { id: string; name: string }[];
		/** Choosing a different client re-takes the whole snapshot, server-side. */
		onclientchange: (customerId: string) => void;
	} = $props();

	const selectedName = $derived(
		customers.find((c) => c.id === state.customerId)?.name ?? state.name
	);
</script>

<section>
	<h2 class="text-eyebrow text-ink-muted uppercase">Who it's for</h2>

	<div class="mt-3 grid gap-4 sm:grid-cols-2">
		<div>
			<Label for="quote-client">Client</Label>
			<div class="mt-1.5">
				<Select
					type="single"
					value={state.customerId ?? ''}
					onValueChange={(value) => {
						if (!value || value === state.customerId) return;
						state.customerId = value;
						onclientchange(value);
					}}
				>
					<SelectTrigger id="quote-client" class="w-full">
						{selectedName || 'Choose a client'}
					</SelectTrigger>
					<SelectContent>
						{#each customers as customer (customer.id)}
							<SelectItem value={customer.id} label={customer.name}>{customer.name}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
		</div>

		<div>
			<Label for="quote-send-to">Send to</Label>
			<div class="mt-1.5">
				<!--
					`type="email"` for the keyboard and the browser's own check, not as the
					validation: the address that must be deliverable is checked at send, where
					failing is meaningful. Blocking a draft over a half-typed address would be the
					form fighting the person filling it in.
				-->
				<Input
					id="quote-send-to"
					type="email"
					inputmode="email"
					autocomplete="email"
					placeholder="name@company.co.za"
					bind:value={state.sendToEmail}
				/>
			</div>
		</div>
	</div>

	<p class="mt-2 text-helper text-ink-muted">
		Filled in from your customer list. Change it here and we'll ask if you want it saved.
	</p>

	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		<div>
			<Label for="quote-client-name">Name on the document</Label>
			<div class="mt-1.5">
				<Input id="quote-client-name" bind:value={state.name} />
			</div>
		</div>
		<div>
			<Label for="quote-client-contact">Contact person</Label>
			<div class="mt-1.5">
				<Input id="quote-client-contact" bind:value={state.contactPerson} />
			</div>
		</div>
	</div>
</section>
