<script lang="ts">
	/**
	 * ONE QUOTE, IN THE TWO STATES IT CAN BE IN.
	 *
	 * A draft gets the editor; anything past draft gets the read-only view and, after
	 * acceptance, the next step. The branch is on the SERVER's answer rather than on a flag in
	 * the URL, so there is no way to reach an editable form for a document a client already
	 * holds.
	 *
	 * Almost nothing else is here. `QuoteEditor` owns the two panes and the autosave, `SentQuote`
	 * owns the outcome — and this file owns the two decisions that genuinely belong to the ROUTE:
	 * what the add-line row offers when Inventory is not owned, and where "add Invoicing" posts.
	 */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { QuoteEditor, SentQuote } from '$lib/components/quoting';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let sending = $state(false);
	let sendForm: HTMLFormElement | null = $state(null);
	let addForm: HTMLFormElement | null = $state(null);
	let invoiceForm: HTMLFormElement | null = $state(null);
	let makingInvoice = $state(false);
</script>

<svelte:head>
	<title>
		{data.mode === 'draft'
			? data.quote.customer.name
				? `Quote for ${data.quote.customer.name}`
				: 'New quote'
			: `${data.document.number} · ${data.clientName}`} · CJs
	</title>
</svelte:head>

{#if data.mode === 'draft'}
	<!--
		Sending is a real form POST. It allocates a number, freezes a snapshot and emails a
		client: three things that must not depend on a fetch the browser might abandon halfway.
	-->
	<form
		bind:this={sendForm}
		method="POST"
		action="?/send"
		class="hidden"
		use:enhance={() => {
			sending = true;
			return async ({ update }) => {
				await update();
				sending = false;
			};
		}}
	></form>

	{#if form?.message}
		<p
			class="mx-8 mt-4 rounded-[10px] border border-wrong-border bg-wrong-tint px-4 py-3 text-ui text-wrong-ink"
			aria-live="polite"
		>
			{form.message}
		</p>
	{/if}

	<QuoteEditor
		quote={data.quote}
		issuer={data.issuer}
		customers={data.customers}
		customerRecord={data.customerRecord}
		usualDays={data.usualDays}
		footer={data.footer}
		provisionalNumber={data.provisionalNumber}
		saveEndpoint="/quoting/{data.quote.id}/save"
		promoteEndpoint="/quoting/{data.quote.id}/promote"
		pdfHref="/documents/{data.quote.id}/pdf"
		{sending}
		onsend={() => sendForm?.requestSubmit()}
	>
		{#snippet inventoryOffer()}
			{#if data.inventoryAccess === 'write'}
				<!--
					The picker itself lands with Inventory (T23/T24). The seam is here now because a
					boundary retrofitted after the first import has already crossed it is not a
					boundary — and because the row has to read as "or pick from Inventory" the day
					it works, without the table changing.
				-->
				<span class="text-ui text-ink-muted">pick from Inventory</span>
			{:else}
				<a
					href={resolve('/inventory')}
					class="rounded-sm text-ui text-brand-ink underline underline-offset-2 outline-none hover:text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
				>
					pick from Inventory
				</a>
			{/if}
		{/snippet}
	</QuoteEditor>
{:else}
	<!--
		Adding Invoicing posts to the module settings action, rather than to a second copy of the
		add-a-module logic living here. There is one place a subscription period opens, and a
		contextual offer is a different DOOR onto it and not a different mechanism.
	-->
	<form
		bind:this={addForm}
		method="POST"
		action="/settings/modules?/add"
		class="hidden"
		use:enhance
	>
		<input type="hidden" name="module" value="invoicing" />
	</form>

	<!--
		"Turn it into an invoice" — a real POST, because it creates a document. Progressively
		enhanced, and it redirects to the new draft.
	-->
	<form
		bind:this={invoiceForm}
		method="POST"
		action="?/makeInvoice"
		class="hidden"
		use:enhance={() => {
			makingInvoice = true;
			return async ({ update }) => {
				await update();
				makingInvoice = false;
			};
		}}
	></form>

	<SentQuote
		document={data.document}
		status={data.status}
		acceptedByName={data.acceptedByName}
		clientName={data.clientName}
		events={data.events}
		pdfHref="/documents/{page.params.id}/pdf"
		invoicingOwned={data.invoicingOwned}
		invoicingPrice={data.invoicingPrice}
		newTotal={data.newTotal}
		existingInvoice={data.existingInvoice}
		{makingInvoice}
		onaddinvoicing={() => addForm?.requestSubmit()}
		onmakeinvoice={() => invoiceForm?.requestSubmit()}
	/>
{/if}
