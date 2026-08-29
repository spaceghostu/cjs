<script lang="ts">
	/**
	 * ONE INVOICE — the draft editor, or the issued document and the story of it.
	 *
	 * Three compositions behind one URL: the editor, the desktop detail, and T22's phone screen,
	 * which is not the desktop one narrowed. The branch is here rather than in three routes
	 * because it is one document — a bookmark taken while it was a draft has to keep working the
	 * day after it is issued, and a link opened on a laptop has to open on a phone.
	 */
	import { enhance } from '$app/forms';
	import {
		CancelInvoiceDialog,
		InvoiceEditor,
		IssuedInvoice,
		MobileInvoice,
		RecordPaymentDialog
	} from '$lib/components/invoicing';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let saving = $state(false);
	let issuing = $state(false);
	let busy = $state(false);
	let paymentOpen = $state(false);
	let cancelOpen = $state(false);

	let issueForm: HTMLFormElement | null = $state(null);
	let discardForm: HTMLFormElement | null = $state(null);
	let simpleForm: HTMLFormElement | null = $state(null);
	let simpleAction = $state<'remind' | 'reversePayment' | 'duplicate'>('remind');
	let reversePaymentId = $state('');

	const message = $derived(form && 'message' in form ? (form.message as string) : null);

	/** What the save endpoint said, when it refused. Shown above the editor. */
	let saveError = $state<string | null>(null);

	/**
	 * The editor's save.
	 *
	 * Its own `+server.ts`, not a form action: the payload is a whole document as JSON — nested
	 * lines, exact integers — and a SvelteKit form action refuses a non-form body before the
	 * handler runs. The same endpoint shape the quote editor posts to.
	 *
	 * Returns whether it landed, because ISSUING depends on the answer.
	 */
	async function save(payload: unknown): Promise<boolean> {
		saving = true;
		saveError = null;
		try {
			const response = await fetch(`/invoicing/${data.invoice.id}/save`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (response.ok) return true;

			// The endpoint says why in language a person can act on — an unpriced line, an invoice
			// that has been issued from another tab. A save indicator that quietly stopped
			// updating would be worse than no indicator at all.
			const body = await response.json().catch(() => null);
			saveError = body?.message ?? "We couldn't save that just now. Nothing was lost — try again.";
			return false;
		} catch {
			saveError = "We couldn't reach the server. Nothing was lost — try again.";
			return false;
		} finally {
			saving = false;
		}
	}

	/**
	 * ISSUING FLUSHES FIRST.
	 *
	 * The editor holds what somebody typed; the server holds what was last saved. Issuing reads
	 * the SERVER's copy, freezes it and emails it — so issuing without flushing would send the
	 * previous version of a document that can never be corrected afterwards, only credit-noted.
	 *
	 * The same rule the quote editor keeps, and it matters more here: a quote can be superseded,
	 * a tax record cannot.
	 */
	async function issue(payload: unknown) {
		issuing = true;
		const saved = await save(payload);
		issuing = false;
		if (saved) issueForm?.requestSubmit();
	}

	function runSimple(action: 'remind' | 'reversePayment' | 'duplicate', paymentId = '') {
		simpleAction = action;
		reversePaymentId = paymentId;
		queueMicrotask(() => simpleForm?.requestSubmit());
	}
</script>

<svelte:head>
	<title>
		{data.mode === 'draft' ? 'New invoice' : (data.invoice.number ?? 'Invoice')} · CJs
	</title>
</svelte:head>

{#if data.mode === 'draft'}
	<div class="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
		<!--
			Real form POSTs for the two acts that change something irreversibly. Without
			JavaScript they still work, which for the button that issues a tax record is worth
			more than the animation it costs.
		-->
		<form
			bind:this={issueForm}
			method="POST"
			action="?/issue"
			class="hidden"
			use:enhance={() => {
				issuing = true;
				return async ({ update }) => {
					await update();
					issuing = false;
				};
			}}
		></form>
		<form bind:this={discardForm} method="POST" action="?/discard" class="hidden"></form>

		<InvoiceEditor
			invoice={data.invoice}
			issuer={data.issuer}
			customers={data.customers}
			bankingDetails={data.bankingDetails}
			footer={data.footer}
			provisionalNumber={data.provisionalNumber}
			usualDays={data.usualDays}
			{saving}
			{issuing}
			message={saveError ?? message}
			onsaveretry={saveError ? save : undefined}
			onsave={save}
			onissue={issue}
			ondiscard={() => discardForm?.requestSubmit()}
		/>
	</div>
{:else}
	<!-- One hidden form for the three actions that carry no fields of their own. -->
	<form
		bind:this={simpleForm}
		method="POST"
		action="?/{simpleAction}"
		class="hidden"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="paymentId" value={reversePaymentId} />
	</form>

	<!-- Desktop: the document, then the story of it. -->
	<div class="hidden lg:block">
		<IssuedInvoice
			invoiceId={data.invoice.id}
			document={data.document}
			status={data.status}
			clientName={data.invoice.customer.name ?? 'This client'}
			issueDate={data.invoice.issueDate}
			dueDate={data.invoice.dueDate}
			viewCount={data.invoice.viewCount}
			total={data.total}
			outstanding={data.outstanding}
			settled={data.settled}
			cancelled={data.invoice.status === 'cancelled'}
			payments={data.payments}
			events={data.events}
			memberNames={data.memberNames}
			viewerUserId={data.viewerUserId}
			margin={data.margin}
			fromInventory={data.fromInventory}
			today={data.today}
			{busy}
			{message}
			onrecordpayment={() => (paymentOpen = true)}
			onreverse={(id) => runSimple('reversePayment', id)}
			onremind={() => runSimple('remind')}
			onduplicate={() => runSimple('duplicate')}
			oncancel={() => (cancelOpen = true)}
		/>
	</div>

	<!-- Phone: lead with the answer. A different composition, not a narrower one. -->
	<div class="lg:hidden">
		<MobileInvoice
			invoiceId={data.invoice.id}
			document={data.document}
			status={data.status}
			clientName={data.invoice.customer.name ?? 'This client'}
			dueDate={data.invoice.dueDate}
			viewCount={data.invoice.viewCount}
			outstanding={data.outstanding}
			settled={data.settled}
			cancelled={data.invoice.status === 'cancelled'}
			events={data.events}
			memberNames={data.memberNames}
			viewerUserId={data.viewerUserId}
			today={data.today}
			{busy}
			onrecordpayment={() => (paymentOpen = true)}
			onremind={() => runSimple('remind')}
		/>
	</div>

	<CancelInvoiceDialog
		bind:open={cancelOpen}
		number={data.invoice.number}
		clientName={data.invoice.customer.name ?? 'This client'}
	/>

	<RecordPaymentDialog
		bind:open={paymentOpen}
		outstanding={data.outstanding}
		today={data.today}
		clientName={data.invoice.customer.name ?? 'this client'}
		message={form && 'message' in form ? (form.message as string) : null}
	/>
{/if}
