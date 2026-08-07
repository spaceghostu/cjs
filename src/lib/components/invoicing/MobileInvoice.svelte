<script lang="ts">
	/**
	 * ONE INVOICE ON A PHONE — T22.
	 *
	 * Not the desktop detail narrowed. The design's framing is that the two mobile screens answer
	 * the phone's own questions — *did they pay*, and *send this* — so this screen **leads with
	 * the answer**:
	 *
	 *   "Baraka Café owes you"
	 *   R24 150            ← 32px mono, in the invoicing accent
	 *   [Due Monday] [Opened twice]
	 *
	 * The document itself is not rendered here. A 560px sheet on a 390px screen is a sheet
	 * nobody can read, so the phone gets a LINE SUMMARY — description left, amount right — and
	 * "PDF" in the header for the person who genuinely wants the paper.
	 *
	 * README OPEN QUESTION 1 APPLIES HERE, and this is the screen it applies to. The design
	 * renders `Shelving unit ×2 → R9 200`, which does not reconcile with the R24 150 header. The
	 * desktop document is authoritative: the amount column is the LINE TOTAL, so this renders
	 * **R4 600**. The `×2` in the description is fine and useful; the amount is the line total.
	 * `lineAmounts()` is where that comes from — the same priced document the sheet and the PDF
	 * read, so this screen cannot disagree with them even by accident.
	 *
	 * EVERY TOUCH TARGET IS AT LEAST 44px, and the footer's two actions are 50 and 48 as the
	 * design specifies. `invoicing.mobile.spec.ts` measures them.
	 */
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { Amount, Badge, Button } from '$lib/ui';
	import {
		REVERSAL_WINDOW_DAYS,
		openCountPhrase,
		statusCopy,
		type InvoiceEvent,
		type InvoiceStatus
	} from '$lib/core/invoicing';
	import type { CalendarDate } from '$lib/core/calendar';
	import type { Money } from '$lib/core/money';
	import type { PrintableDocument } from '$lib/core/document';
	import ActivityTimeline from './ActivityTimeline.svelte';

	let {
		invoiceId,
		document,
		status,
		clientName,
		dueDate,
		viewCount,
		outstanding,
		settled,
		cancelled,
		events,
		memberNames,
		viewerUserId,
		today,
		busy = false,
		onrecordpayment,
		onremind
	}: {
		invoiceId: string;
		document: PrintableDocument;
		status: InvoiceStatus;
		clientName: string;
		dueDate: CalendarDate | null;
		viewCount: number;
		outstanding: Money;
		settled: boolean;
		cancelled: boolean;
		events: readonly InvoiceEvent[];
		memberNames: Readonly<Record<string, string>>;
		viewerUserId: string;
		today: CalendarDate;
		busy?: boolean;
		onrecordpayment: () => void;
		onremind: () => void;
	} = $props();

	const badge = $derived(statusCopy({ status, dueDate, paidOn: null, hasAmount: true }, today));

	/** The two most recent events. A phone has room for the story, not for the archive. */
	const recent = $derived(
		[...events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 2)
	);

	/**
	 * From the denormalised counter, not from the events in this list — the phone trims the
	 * timeline to two entries, and counting opens out of a trimmed list would report "once" for a
	 * client who opened it five times. `detailSentence` reads the same counter on the desktop.
	 */
	const opens = $derived(viewCount);
</script>

<!-- Hrefs carry an invoice id — see the note in `InvoiceTable.svelte`. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="flex min-h-dvh flex-col">
	<!-- ── Header: back, number, PDF ────────────────────────────────────────────────── -->
	<header class="flex items-center justify-between gap-2 px-4 py-3">
		<!-- 44px, like every other target on this screen. -->
		<a
			href="/invoicing"
			aria-label="Back to invoices"
			class="-ml-2 flex size-11 items-center justify-center rounded-[8px] text-ink-secondary
				outline-none hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2
				focus-visible:outline-brand-focus-ring"
		>
			<ChevronLeft class="size-5" aria-hidden="true" />
		</a>

		<p class="numeric text-[15px] font-medium text-ink">{document.number}</p>

		<a
			href="/documents/{invoiceId}/pdf"
			data-sveltekit-reload
			class="-mr-2 flex h-11 items-center rounded-[8px] px-2 text-[13px] text-ink-secondary
				outline-none hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2
				focus-visible:outline-brand-focus-ring"
		>
			PDF
		</a>
	</header>

	<main class="flex-1 px-4 pb-4">
		<!-- ── Lead with the answer ───────────────────────────────────────────────────── -->
		<section>
			{#if cancelled}
				<p class="text-ui text-ink-secondary">This invoice was cancelled</p>
			{:else if settled}
				<p class="text-ui text-ink-secondary">{clientName} has paid</p>
			{:else}
				<p class="text-ui text-ink-secondary">{clientName} owes you</p>
			{/if}

			<p class="mt-1">
				<Amount
					value={settled || cancelled ? document.totals.total : outstanding}
					size="hero"
					tone={settled || cancelled ? 'default' : 'owed'}
					decimals={0}
				/>
			</p>

			<div class="mt-2 flex flex-wrap items-center gap-2">
				<Badge variant={badge.tone}>{badge.text}</Badge>
				{#if opens > 0}
					<span class="text-helper text-ink-muted">
						Opened {openCountPhrase(opens).toLowerCase()}
					</span>
				{/if}
			</div>
		</section>

		<!-- ── The lines, summarised ──────────────────────────────────────────────────── -->
		<section class="mt-6 rounded-[12px] border border-line-default bg-surface-card px-4 py-1.5">
			<h2 class="sr-only">What is on this invoice</h2>
			<dl>
				{#each document.lines as line (line.id)}
					<div
						class="flex items-baseline justify-between gap-4 border-b border-line-subtle py-2.5 last:border-b-0"
					>
						<dt class="min-w-0 text-ui text-ink-secondary">{line.description}</dt>
						<!--
							THE LINE TOTAL. R4 600 for two shelving units at R2 300 — not R9 200, which
							is what the design renders and what does not reconcile with the header.
						-->
						<dd class="shrink-0"><Amount value={line.amount} size="sm" /></dd>
					</div>
				{/each}

				<div class="flex items-baseline justify-between gap-4 border-t border-line-default py-3">
					<dt class="text-ui text-ink">{document.totals.totalLabel}</dt>
					<dd><Amount value={document.totals.total} size="md" /></dd>
				</div>
			</dl>
		</section>

		<!-- ── What's happened, trimmed to two ────────────────────────────────────────── -->
		<section class="mt-6">
			<ActivityTimeline events={recent} {viewerUserId} {clientName} {memberNames} />
		</section>
	</main>

	{#if !cancelled}
		<!--
			Footer actions, over a fade so the last line of the panel above does not look cut off.
			50px and 48px, as the design specifies — both comfortably over the 44px floor.

			`sticky`, not `fixed`, for the reason `PrimaryAction` gives: a sticky element still
			occupies its place in the flow, so at the bottom of the scroll it comes to rest AFTER
			the timeline rather than on top of it — with no clearance padding to keep in sync with
			this block's height, and no way for the two to drift apart.
		-->
		<div
			class="sticky right-0 bottom-0 left-0 z-20 bg-gradient-to-t from-surface-base
				via-surface-base to-surface-base/0 px-4 pt-8 pb-3"
		>
			{#if !settled}
				<Button class="h-[50px] w-full rounded-[12px]" disabled={busy} onclick={onrecordpayment}>
					Record a payment
				</Button>
			{/if}
			<Button
				variant="secondary"
				class="mt-2 h-12 w-full rounded-[12px]"
				disabled={busy}
				onclick={onremind}
			>
				Send a reminder
			</Button>
			<!--
				"Both can be undone." — true, and it has to stay true: a payment is reversible for
				thirty days, and a reminder is an email plus an event, neither of which changes the
				document. If either ever stopped being reversible, this line would have to go with it.
			-->
			<p class="mt-2 text-center text-helper text-ink-muted">
				Both can be undone. Payments for {REVERSAL_WINDOW_DAYS} days.
			</p>
		</div>
	{/if}
</div>
