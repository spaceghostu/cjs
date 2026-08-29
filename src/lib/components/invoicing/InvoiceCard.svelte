<script lang="ts">
	/**
	 * ONE INVOICE ON A PHONE — T22.
	 *
	 * "Cards, not rows." This is not the desktop table narrowed; it is a different composition
	 * answering a different question. On a phone the question is *did they pay*, so the AMOUNT is
	 * the biggest thing on the card at 22px mono, and the invoice number and due date drop to a
	 * 12px line underneath.
	 *
	 * ACTIONS APPEAR ON THE ONE CARD THAT NEEDS THEM, and that is the whole idea:
	 *
	 *   > Actions appear on the one card that needs them. Every other card is information.
	 *
	 * A list where every card carries two buttons is a list of forty buttons, and the one that
	 * matters is invisible in it. `needsAction` is the caller's decision, made once for the whole
	 * list, so exactly one card can be the one.
	 *
	 * Design values: `--surface-card`, `--border-default`, radius 12px, padding 16px; the amount
	 * in `#3FB3A8` when it is money owed and `--text-primary` otherwise; both buttons 44px.
	 */
	import { Amount, Button } from '$lib/ui';
	import type { InvoiceListItem } from '$lib/core/invoicing';
	import { formatShortDate, type CalendarDate } from '$lib/core/calendar';
	import StatusBadge from './StatusBadge.svelte';

	let {
		invoice,
		today,
		needsAction = false,
		onremind,
		onmarkpaid,
		busy = false
	}: {
		invoice: InvoiceListItem;
		today: CalendarDate;
		/** True on at most one card in a list. See the note above. */
		needsAction?: boolean;
		onremind?: () => void;
		onmarkpaid?: () => void;
		busy?: boolean;
	} = $props();

	/** Money owed takes the invoicing accent. Anything settled or withdrawn is plain ink. */
	const owed = $derived(
		invoice.status === 'sent' || invoice.status === 'viewed' || invoice.status === 'overdue'
	);
</script>

<!-- The row href carries an invoice id — see the note in `InvoiceTable.svelte`. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<article
	class="relative rounded-[12px] border border-line-default bg-surface-card p-4"
	data-testid="invoice-card"
>
	<div class="flex items-start justify-between gap-3">
		<a
			href="/invoicing/{invoice.id}"
			class="text-[15px] text-ink outline-none after:absolute after:inset-0 after:content-['']
				focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
		>
			{invoice.customerName ?? 'No client chosen yet'}
		</a>

		<StatusBadge
			{today}
			facts={{
				status: invoice.status,
				dueDate: invoice.dueDate,
				paidOn: invoice.paidOn,
				hasAmount: invoice.hasAmount
			}}
		/>
	</div>

	<div class="mt-2">
		{#if invoice.total}
			<Amount value={invoice.total} size="xl" tone={owed ? 'owed' : 'default'} decimals={0} />
		{:else}
			<span class="numeric text-[22px] text-ink-muted">
				<span aria-hidden="true">—</span>
				<span class="sr-only">Not priced yet</span>
			</span>
		{/if}
	</div>

	<p class="mt-1 numeric text-helper text-ink-muted">
		{invoice.number ?? 'Draft'}{invoice.dueDate ? ` · ${formatShortDate(invoice.dueDate)}` : ''}
	</p>

	{#if needsAction}
		<!--
			Side by side, 44px each — the floor for a touch target, and the reason these are
			`h-11` rather than the default control height. They sit ABOVE the card's stretched
			link (`relative z-10`), or the link would swallow every tap meant for a button.
		-->
		<div class="relative z-10 mt-4 grid grid-cols-2 gap-2">
			<Button variant="secondary" class="h-11 w-full" disabled={busy} onclick={onremind}>
				Remind them
			</Button>
			<Button variant="secondary" class="h-11 w-full" disabled={busy} onclick={onmarkpaid}>
				Mark paid
			</Button>
		</div>
	{/if}
</article>
