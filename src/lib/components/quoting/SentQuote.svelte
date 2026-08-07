<script lang="ts">
	/**
	 * A QUOTE THAT HAS LEFT THE BUILDING.
	 *
	 * The design shows the outcome of acceptance rather than the client's screen:
	 *
	 *   > Quote QT-1041 was accepted by Waterkant Property Group
	 *
	 * followed by the next step. So this screen is that sentence, the document exactly as the
	 * client has it, what has happened to it, and — when there is one — the offer.
	 *
	 * IT IS READ-ONLY, AND THAT IS THE POINT. The client holds a PDF. Editing the document they
	 * are looking at, silently, from the other side, is the single worst thing this module could
	 * do — so a sent quote has no form at all rather than a form that fails on save.
	 *
	 * THE OFFER, AND THE WAY OUT
	 * --------------------------
	 * With Invoicing owned: "Turn it into an invoice". Without it: T13's contextual add, which
	 * carries the escape hatch —
	 *
	 *   > Or download the accepted quote as a PDF and invoice it yourself — no module needed.
	 *
	 * That link is real, it points at a working PDF, and nothing about it is styled to lose. It
	 * is the design's proof that modules are not hostage-taking.
	 */
	import Check from '@lucide/svelte/icons/check';
	import { Button } from '$lib/ui';
	import { DocumentSheet } from '$lib/components/document';
	import { ContextualAdd } from '$lib/components/modules';
	import { accentText } from '$lib/components/shell';
	import { navIcon } from '$lib/components/shell/icons';
	import { formatShortDate, type QuoteStatus } from '$lib/core/quoting';
	import type { PrintableDocument } from '$lib/core/document';
	import type { Money } from '$lib/core/money';
	import type { ModuleKey } from '$lib/core/modules/catalogue';

	type TimelineEntry = {
		id: string;
		kind: 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
		detail: string | null;
		occurredAt: Date;
	};

	let {
		document,
		status,
		acceptedByName,
		clientName,
		events,
		pdfHref,
		invoicingOwned,
		invoicingPrice,
		newTotal,
		onaddinvoicing
	}: {
		document: PrintableDocument;
		status: QuoteStatus;
		acceptedByName: string | null;
		clientName: string;
		events: readonly TimelineEntry[];
		pdfHref: string;
		invoicingOwned: boolean;
		/** Null only if the catalogue ever stops pricing a module. The way out survives it. */
		invoicingPrice: Money | null;
		/** What the monthly total becomes WITH Invoicing. Computed, never written down. */
		newTotal: Money;
		onaddinvoicing: (key: ModuleKey) => void;
	} = $props();

	const Icon = navIcon('quoting');

	/**
	 * How many times the client opened it.
	 *
	 * The design's "Opened it twice" — a fact about a number, said only when the number is
	 * interesting. Once is not news; a client who has read it three times is.
	 */
	const opens = $derived(events.filter((e) => e.kind === 'viewed').length);

	const VERBS: Readonly<Record<TimelineEntry['kind'], string>> = {
		sent: 'Sent to the client',
		viewed: 'Opened by the client',
		accepted: 'Accepted',
		declined: 'Declined',
		expired: 'Passed its valid-until date'
	};

	function on(at: Date): string {
		return formatShortDate(
			`${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
		);
	}
</script>

<!--
	`pdfHref` is caller-supplied DATA — the document route for this quote — so there is no
	literal route id for `resolve()` to check it against. Same situation as `ContextualAdd`'s
	escape hatch, which this screen also renders.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="mx-auto w-full max-w-4xl px-4 py-8 lg:px-8">
	<p class="flex items-center gap-1.5 {accentText('quoting')}">
		<Icon size={14} strokeWidth={1.75} aria-hidden="true" />
		<span class="text-[12px]">Quoting</span>
	</p>

	{#if status === 'accepted'}
		<h1 class="mt-1.5 flex flex-wrap items-center gap-2 text-[24px] font-semibold text-ink">
			<Check size={20} aria-hidden="true" class="shrink-0 text-settled" />
			Quote {document.number} was accepted by {acceptedByName ?? clientName}
		</h1>
	{:else if status === 'declined'}
		<h1 class="mt-1.5 text-[24px] font-semibold text-ink">
			Quote {document.number} was declined
		</h1>
	{:else if status === 'expired'}
		<h1 class="mt-1.5 text-[24px] font-semibold text-ink">
			Quote {document.number} has passed its date
		</h1>
	{:else}
		<h1 class="mt-1.5 text-[24px] font-semibold text-ink">
			Quote {document.number} is with {clientName}
		</h1>
		<p class="mt-2 text-ui text-ink-secondary">
			{#if opens > 1}
				Opened it {opens} times. No answer yet.
			{:else if opens === 1}
				They have opened it. No answer yet.
			{:else}
				Not opened yet.
			{/if}
		</p>
	{/if}

	{#if status === 'accepted'}
		<section class="mt-6">
			{#if invoicingOwned}
				<div
					class="flex flex-col gap-3 rounded-[10px] border border-line-default bg-surface-raised p-5"
				>
					<p class="text-ui text-ink">Turn it into an invoice</p>
					<p class="text-helper text-ink-muted">
						The lines, the client and the totals come across as they are.
					</p>
					<div>
						<Button variant="secondary" href="/invoicing">Turn it into an invoice</Button>
					</div>
				</div>
			{:else if invoicingPrice}
				<ContextualAdd
					moduleKey="invoicing"
					label="Invoicing"
					accent="invoicing"
					headline="Turn it into an invoice"
					price={invoicingPrice}
					{newTotal}
					escape={{
						label: 'download the accepted quote as a PDF and invoice it yourself',
						href: pdfHref
					}}
					onadd={onaddinvoicing}
				/>
			{:else}
				<!--
					An unpriced module cannot be offered honestly — the design's rule is that nothing
					about the money is discovered later. The WAY OUT survives regardless, because it
					is the part that must always work.
				-->
				<p class="text-ui text-ink-secondary">
					You can
					<a
						href={pdfHref}
						data-sveltekit-reload
						class="underline underline-offset-2 outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
					>
						download the accepted quote as a PDF and invoice it yourself
					</a>
					— no module needed.
				</p>
			{/if}
		</section>
	{/if}

	<section class="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
		<div class="min-w-0">
			<h2 class="text-eyebrow text-ink-muted uppercase">What the client has</h2>
			<div class="mt-3">
				<DocumentSheet {document} />
			</div>
			<div class="mt-3">
				<Button
					variant="secondary"
					href={pdfHref}
					target="_blank"
					rel="noopener"
					data-sveltekit-reload
				>
					Download the PDF
				</Button>
			</div>
		</div>

		<div>
			<h2 class="text-eyebrow text-ink-muted uppercase">What has happened</h2>
			<ol class="mt-3 flex flex-col gap-3">
				{#each events as entry (entry.id)}
					<li class="text-ui text-ink-secondary">
						<span class="block text-ink">{VERBS[entry.kind]}</span>
						<span class="block text-helper text-ink-muted">
							{on(entry.occurredAt)}{entry.detail ? ` · ${entry.detail}` : ''}
						</span>
					</li>
				{/each}
			</ol>
		</div>
	</section>
</div>
