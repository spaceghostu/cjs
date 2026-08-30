<script module lang="ts">
	/**
	 * ONE INVOICE, INSIDE THE GATE — SPA-16.
	 *
	 * The three compositions behind `/invoicing/[id]`: the draft editor, the desktop detail,
	 * and the phone screen. Two of this ticket's fixes live here and these stories are what
	 * hold them from now on — the editor's polite save-status line (exercised by the saved
	 * state below) and MobileInvoice's landmark and h1 corrections, swept in both themes on
	 * every run.
	 *
	 * The dialogs (RecordPaymentDialog, CancelInvoiceDialog) are deliberately not storied:
	 * the bits-ui Dialog primitive already carries stories with a focus-trap play test
	 * (`ui/Dialog.stories.svelte`, SPA-15), and the module dialogs inherit the standing
	 * story-per-component rule when next touched.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import InvoiceEditor from '$lib/components/invoicing/InvoiceEditor.svelte';
	import IssuedInvoice from '$lib/components/invoicing/IssuedInvoice.svelte';
	import MobileInvoice from '$lib/components/invoicing/MobileInvoice.svelte';
	import {
		BANKING_DETAILS,
		CUSTOMERS,
		DOCUMENT_FOOTER,
		DRAFT_INVOICE,
		EVENTS,
		INV_1042,
		ISSUER,
		MARGIN_KNOWN,
		MARGIN_UNKNOWN,
		MEMBER_NAMES,
		PART_PAYMENT,
		SETTLING_PAYMENTS,
		TODAY
	} from './invoicing/fixtures';
	import { parseMoneyInput, type Money } from '$lib/core/money';

	const { Story } = defineMeta({
		title: 'Invoicing/Detail',
		component: IssuedInvoice,
		parameters: { layout: 'fullscreen' }
	});

	const noop = () => {};

	function money(input: string): Money {
		const parsed = parseMoneyInput(input);
		if (!parsed.ok) throw new Error(parsed.message);
		return parsed.value;
	}

	const EDITOR_PROPS = {
		invoice: DRAFT_INVOICE,
		issuer: ISSUER,
		customers: CUSTOMERS,
		bankingDetails: BANKING_DETAILS,
		footer: DOCUMENT_FOOTER,
		provisionalNumber: 'INV-1044',
		usualDays: 14,
		onsave: noop,
		onissue: noop,
		ondiscard: noop
	};

	const ISSUED_PROPS = {
		invoiceId: 'inv',
		document: INV_1042,
		status: 'sent' as const,
		clientName: 'Baraka Café',
		issueDate: '2026-07-18',
		dueDate: '2026-08-01',
		viewCount: 2,
		total: money('24150.00'),
		outstanding: money('24150.00'),
		settled: false,
		cancelled: false,
		payments: [],
		events: EVENTS,
		memberNames: MEMBER_NAMES,
		viewerUserId: 'u1',
		margin: MARGIN_KNOWN,
		fromInventory: true,
		today: TODAY,
		onrecordpayment: noop,
		onreverse: noop,
		onremind: noop,
		onduplicate: noop,
		oncancel: noop
	};

	const MOBILE_PROPS = {
		invoiceId: 'inv',
		document: INV_1042,
		status: 'sent' as const,
		clientName: 'Baraka Café',
		dueDate: '2026-08-01',
		viewCount: 2,
		outstanding: money('24150.00'),
		settled: false,
		cancelled: false,
		events: EVENTS,
		memberNames: MEMBER_NAMES,
		viewerUserId: 'u1',
		today: TODAY,
		onrecordpayment: noop,
		onremind: noop
	};
</script>

<!-- The draft editor as it opens: nothing saved yet, nothing to announce. -->
<Story name="Editor · new draft" asChild>
	<div class="min-h-svh bg-surface-base p-6 lg:p-8">
		<InvoiceEditor {...EDITOR_PROPS} />
	</div>
</Story>

<!-- The saved state — the story that holds this ticket's polite status line in the gate. -->
<Story name="Editor · all changes saved" asChild>
	<div class="min-h-svh bg-surface-base p-6 lg:p-8">
		<InvoiceEditor {...EDITOR_PROPS} lastSavedAtMs={new Date('2026-07-29T09:47:00').getTime()} />
	</div>
</Story>

<!--
	The failed save: the Refusal announces the error and offers the retry; the status line
	stays quiet — disjoint content, so nothing is announced twice.
-->
<Story name="Editor · save refused" asChild>
	<div class="min-h-svh bg-surface-base p-6 lg:p-8">
		<InvoiceEditor
			{...EDITOR_PROPS}
			lastSavedAtMs={new Date('2026-07-29T09:47:00').getTime()}
			message="We couldn't save that just now. Nothing was lost — try again."
			onsaveretry={noop}
		/>
	</div>
</Story>

<!-- The desktop detail while money is owed: document leading, the story of it beside. -->
<Story name="Issued · owing" asChild>
	<div class="min-h-svh bg-surface-base">
		<IssuedInvoice {...ISSUED_PROPS} />
	</div>
</Story>

<Story name="Issued · partly paid" asChild>
	<div class="min-h-svh bg-surface-base">
		<IssuedInvoice
			{...ISSUED_PROPS}
			status="viewed"
			outstanding={money('14150.00')}
			payments={PART_PAYMENT}
		/>
	</div>
</Story>

<Story name="Issued · settled" asChild>
	<div class="min-h-svh bg-surface-base">
		<IssuedInvoice
			{...ISSUED_PROPS}
			status="paid"
			settled
			outstanding={money('0.00')}
			payments={SETTLING_PAYMENTS}
		/>
	</div>
</Story>

<!-- Cancelled, with the margin panel honest about knowing nothing. -->
<Story name="Issued · cancelled" asChild>
	<div class="min-h-svh bg-surface-base">
		<IssuedInvoice
			{...ISSUED_PROPS}
			status="cancelled"
			cancelled
			outstanding={money('0.00')}
			margin={MARGIN_UNKNOWN}
			fromInventory={false}
		/>
	</div>
</Story>

<!-- The phone screen, at the phone's width — the story that holds the landmark and h1 fixes. -->
<Story name="Mobile · owing" asChild>
	<div class="min-h-svh bg-surface-base">
		<div class="mx-auto w-full max-w-[390px]">
			<MobileInvoice {...MOBILE_PROPS} />
		</div>
	</div>
</Story>

<Story name="Mobile · settled" asChild>
	<div class="min-h-svh bg-surface-base">
		<div class="mx-auto w-full max-w-[390px]">
			<MobileInvoice {...MOBILE_PROPS} status="paid" settled outstanding={money('0.00')} />
		</div>
	</div>
</Story>
