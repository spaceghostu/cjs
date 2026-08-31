<script lang="ts">
	/**
	 * THE ISSUED INVOICE — _"the document, then the story of it."_
	 *
	 * The design's subtitle states the two commitments this screen has to keep:
	 *
	 *   > Recording a payment is reversible and says so; the reasoning behind every number stays
	 *   > one tap away.
	 *
	 * Both are structural here rather than decorative:
	 *
	 *   REVERSIBILITY IS STATED BEFORE THE ACTION. The rail says "Recording a payment can be
	 *   undone for 30 days. Cancelling an invoice can't — we'll ask you to confirm." ABOVE the
	 *   buttons, not in a dialog after one is pressed. A consequence disclosed only once somebody
	 *   has committed is not a disclosure, it is an apology.
	 *
	 *   THE REASONING IS ONE TAP AWAY. `MarginPanel` reads ledger postings, and "See the
	 *   workings" opens them. Nothing on this screen is a display calculation.
	 *
	 * THE MOBILE COMPOSITION IS NOT THIS ONE NARROWED — T22. On a phone the question is *did they
	 * pay*, so the answer leads: "Baraka Café owes you", then the amount at 32px, then the badge.
	 * The desktop leads with the document, because on a laptop the question is *what did we send
	 * them*.
	 */
	import { Amount, Badge, Button, Refusal } from '$lib/ui';
	import { DocumentSheet } from '$lib/components/document';
	import {
		REVERSAL_WINDOW_DAYS,
		detailSentence,
		statusCopy,
		type InvoiceEvent,
		type InvoiceStatus,
		type MarginPanel as MarginPanelData,
		type PaymentMethod
	} from '$lib/core/invoicing';
	import { formatShortDate, type CalendarDate } from '$lib/core/calendar';
	import type { Money } from '$lib/core/money';
	import type { PrintableDocument } from '$lib/core/document';
	import ActivityTimeline from './ActivityTimeline.svelte';
	import MarginPanel from './MarginPanel.svelte';

	type PaymentRow = {
		id: string;
		kind: 'payment' | 'reversal';
		amount: Money;
		method: PaymentMethod;
		reference: string | null;
		receivedOn: CalendarDate;
		recordedAt: Date;
		reversible: boolean;
	};

	let {
		invoiceId,
		document,
		status,
		clientName,
		issueDate,
		dueDate,
		viewCount,
		total,
		outstanding,
		settled,
		cancelled,
		payments,
		events,
		memberNames,
		viewerUserId,
		margin,
		fromInventory,
		today,
		busy = false,
		message = null,
		onrecordpayment,
		onreverse,
		onremind,
		onduplicate,
		oncancel
	}: {
		invoiceId: string;
		document: PrintableDocument;
		status: InvoiceStatus;
		clientName: string;
		issueDate: CalendarDate | null;
		dueDate: CalendarDate | null;
		viewCount: number;
		total: Money;
		outstanding: Money;
		settled: boolean;
		cancelled: boolean;
		payments: readonly PaymentRow[];
		events: readonly InvoiceEvent[];
		memberNames: Readonly<Record<string, string>>;
		viewerUserId: string;
		margin: MarginPanelData;
		fromInventory: boolean;
		today: CalendarDate;
		busy?: boolean;
		message?: string | null;
		onrecordpayment: () => void;
		onreverse: (paymentId: string) => void;
		onremind: () => void;
		onduplicate: () => void;
		oncancel: () => void;
	} = $props();

	const badge = $derived(statusCopy({ status, dueDate, paidOn: null, hasAmount: true }, today));

	const sentence = $derived(detailSentence({ issueDate, dueDate, viewCount, today }));
</script>

<!-- Hrefs carry an invoice id — see the note in `InvoiceTable.svelte`. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
	<!-- ── Header band ──────────────────────────────────────────────────────────────── -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="flex items-center gap-1.5 text-helper">
				<a
					href="/invoicing"
					class="text-invoicing-ink outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
					>Invoicing</a
				>
				<span class="text-decoration-quiet" aria-hidden="true">/</span>
				<span class="numeric text-ink-muted">{document.number}</span>
			</p>

			<!-- Client and amount together, as the design words it: "Baraka Café · R24 150". -->
			<h1 class="mt-1 flex flex-wrap items-baseline gap-2 text-[24px] font-semibold text-ink">
				<span>{clientName}</span>
				<span class="text-decoration-quiet" aria-hidden="true">·</span>
				<Amount value={total} size="xl" decimals={0} />
			</h1>

			<p class="mt-1 flex flex-wrap items-center gap-2 text-ui text-ink-secondary">
				<span>{sentence}</span>
				<Badge variant={badge.tone}>{badge.text}</Badge>
			</p>
		</div>

		{#if !cancelled}
			<div class="flex flex-wrap gap-2">
				<Button variant="secondary" disabled={busy} onclick={onremind}>Send a reminder</Button>
				{#if !settled}
					<Button disabled={busy} onclick={onrecordpayment}>Record a payment</Button>
				{/if}
			</div>
		{/if}
	</div>

	<!--
		No retry offered here. Everything that surfaces on an issued invoice is an ACTION refusal
		— a reminder that would not send, a payment reversal the server declined — and the
		action's own button is already the retry. A second one beside the sentence would only
		raise the question of which to press.
	-->
	{#if message}
		<Refusal {message} class="mt-4" />
	{/if}

	<div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
		<!-- ── Centre: the document, on its sunken gutter ────────────────────────────── -->
		<div class="min-w-0 rounded-[12px] bg-surface-sunken p-4 lg:p-8">
			<div class="mx-auto max-w-[560px]">
				<DocumentSheet {document} />
			</div>
		</div>

		<!-- ── Right rail ───────────────────────────────────────────────────────────── -->
		<div class="flex min-w-0 flex-col gap-6">
			{#if !settled && !cancelled}
				<section class="rounded-[12px] border border-line-default bg-surface-card p-4">
					<p class="text-helper text-ink-muted">Still owed</p>
					<p class="mt-1"><Amount value={outstanding} size="xl" tone="owed" /></p>
				</section>
			{/if}

			<ActivityTimeline {events} {viewerUserId} {clientName} {memberNames} />

			{#if payments.length > 0}
				<section>
					<h2 class="text-ui font-medium text-ink">Payments</h2>
					<ul class="mt-3 flex flex-col gap-3">
						{#each payments as payment (payment.id)}
							<li class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="text-[13px] text-ink">
										{payment.kind === 'reversal' ? 'Undone · ' : ''}<Amount
											value={payment.amount}
											size="sm"
										/>
									</p>
									<p class="mt-0.5 text-helper text-ink-muted">
										{formatShortDate(payment.receivedOn)}{payment.reference
											? ` · ${payment.reference}`
											: ''}
									</p>
								</div>

								{#if payment.reversible}
									<!--
										Present only while it is actually possible. The server decided that
										against its own clock, so the button is absent rather than
										present-and-refused — a control that exists and then says no is
										worse than one that was never offered.
									-->
									<Button
										variant="quiet"
										class="h-8 px-2 text-[13px]"
										disabled={busy}
										onclick={() => onreverse(payment.id)}
									>
										Undo
									</Button>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<MarginPanel panel={margin} {fromInventory} workingsHref="/invoicing/{invoiceId}/workings" />

			<!-- ── Reversibility, stated ──────────────────────────────────────────────── -->
			<section class="border-t border-line-default pt-4">
				<!--
					BEFORE the actions, not after. The interface states the consequence where somebody
					reads it on their way to the button, which is the whole of T21's second promise.
				-->
				<p class="text-[13px] text-ink-secondary">
					Recording a payment can be undone for {REVERSAL_WINDOW_DAYS} days. Cancelling an invoice can't
					— we'll ask you to confirm.
				</p>

				<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
					<a
						href="/documents/{invoiceId}/pdf"
						data-sveltekit-reload
						class="text-[13px] text-ink-secondary underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
					>
						Download PDF
					</a>
					<span class="text-decoration-quiet" aria-hidden="true">·</span>
					<!--
						A button, not a link: duplicating WRITES a new draft, and a GET that creates a
						document is one browser prefetch away from a surprise.
					-->
					<Button
						variant="quiet"
						class="h-8 px-2 text-[13px] font-normal text-ink-secondary"
						disabled={busy}
						onclick={onduplicate}
					>
						Duplicate
					</Button>

					{#if !cancelled}
						<span class="text-decoration-quiet" aria-hidden="true">·</span>
						<!-- T02's destructive variant. The one control on this screen that ends something. -->
						<Button
							variant="destructive"
							class="h-8 px-2 text-[13px]"
							disabled={busy}
							onclick={oncancel}
						>
							Cancel invoice
						</Button>
					{/if}
				</div>
			</section>
		</div>
	</div>
</div>
