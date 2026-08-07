<script lang="ts">
	/**
	 * WHAT THE CLIENT SEES.
	 *
	 * **Awaiting a design pass**, and it says so at the bottom of the page. Kept to exactly what
	 * somebody following an invoice link needs: the document, what is still owed, and the banking
	 * details — which are already in the sheet's footer.
	 *
	 * Deliberately plain in the ways that matter to a person who is not a customer of ours: no
	 * product marketing, no sign-up prompt, no "powered by". They came to read an invoice from a
	 * joinery, and the joinery's document is the only thing on the page that should be loud.
	 *
	 * The sheet renders on the theme-invariant `--paper-*` tokens, so this page looks the same as
	 * the PDF in their inbox whatever their device thinks about dark mode.
	 */
	import { DocumentSheet } from '$lib/components/document';
	import { Amount } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Settled, withdrawn, or still owed — the three things this page can be about. */
	const settled = $derived(data.status === 'paid' || data.outstanding?.cents === 0);
</script>

<svelte:head>
	<title>{data.document.number ?? 'Invoice'} from {data.tradingName}</title>
	<!-- A shared document is not for search engines, whatever else the token protects. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-10">
	<DocumentSheet document={data.document} />

	<section class="rounded-[12px] border border-line-default bg-surface-card p-5">
		{#if data.status === 'cancelled'}
			<p class="text-ui text-ink">
				This invoice was cancelled by {data.tradingName}, so nothing is owed on it. If you were
				expecting a different document, get in touch with them.
			</p>
		{:else if settled}
			<!--
				The most useful sentence this page can show a client who has already paid: that it
				landed. It is also the reason the outstanding figure is computed on the business's
				side and only the ANSWER crosses — the payments table has no share policy.
			-->
			<p class="text-ui text-ink">
				This invoice has been paid in full. Thank you — nothing further is owed.
			</p>
		{:else if data.outstanding}
			<p class="text-ui text-ink-secondary">Still owed</p>
			<p class="mt-1">
				<Amount value={data.outstanding} size="lg" />
			</p>
			<p class="mt-3 text-helper text-ink-muted">
				The banking details are at the bottom of the invoice above. Please use
				{data.document.number ?? 'the invoice number'} as your reference, so {data.tradingName}
				can match your payment.
			</p>
		{:else}
			<p class="text-ui text-ink-secondary">
				The banking details are at the bottom of the invoice above. Please use
				{data.document.number ?? 'the invoice number'} as your reference.
			</p>
		{/if}
	</section>

	<!--
		Said out loud rather than left as a surprise, the same note the other undesigned screens
		carry. A screen that has not had a design pass should say so to the person looking at it,
		not only in a ticket.
	-->
	<p class="text-center text-helper text-ink-muted">
		This page is awaiting a design pass. The invoice itself is designed; the page you are reading it
		on is not.
	</p>
</main>
