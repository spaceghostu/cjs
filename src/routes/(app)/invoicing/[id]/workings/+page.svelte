<script lang="ts">
	/**
	 * THE WORKINGS.
	 *
	 * Every posting behind the margin panel, so the figures on the previous screen can be
	 * checked rather than believed. Deliberately plain, and deliberately in the product's own
	 * words rather than an accountant's: the entry says "Invoice issued", not "Journal 4412 Dr
	 * 1100 Cr 4000", and the accounts are named in English.
	 *
	 * A debit and a credit are shown as "in" and "out" against the thing they happened to. A
	 * small business owner should be able to read this page without having been taught double
	 * entry — which is the whole reason the ledger is behind the product rather than in front of
	 * it.
	 */
	import { Amount } from '$lib/ui';
	import { formatShortDate } from '$lib/core/calendar';
	import { marginFootnote } from '$lib/core/invoicing';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The ledger's vocabulary, in the product's words.
	 *
	 * `schema/ledger.ts` says the same thing from the other side: "The screens say 'Materials',
	 * 'Labour' and 'What you keep' … nothing user-facing ever sees the word `vat_output`."
	 */
	const ACCOUNTS: Readonly<Record<string, string>> = {
		receivable: 'Owed by the client',
		revenue: 'What you charged',
		vat_output: 'VAT you collected for SARS',
		bank: 'Money received',
		cost_materials: 'Materials cost',
		cost_labour: 'Labour cost',
		inventory: 'Stock used',
		cost_payable: 'Owed for the work'
	};

	const ENTRIES: Readonly<Record<string, string>> = {
		invoice_issued: 'Invoice issued',
		cost_of_sale_materials: 'Materials on this job',
		cost_of_sale_labour: 'Labour on this job',
		payment_received: 'Payment received',
		payment_reversed: 'Payment undone',
		invoice_cancelled: 'Invoice cancelled'
	};
</script>

<svelte:head><title>Workings · {data.number ?? 'Invoice'} · CJs</title></svelte:head>

<!-- The href carries an invoice id — see the note in `InvoiceTable.svelte`. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8">
	<p class="text-helper">
		<a
			href="/invoicing/{data.invoiceId}"
			class="text-invoicing-ink outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
		>
			← Back to {data.number ?? 'the invoice'}
		</a>
	</p>

	<h1 class="mt-2 text-[24px] font-semibold text-ink">The workings</h1>
	<p class="mt-1 text-ui text-ink-secondary">
		Every entry behind the figures on {data.number ?? 'this invoice'}, in the order they happened.
	</p>

	{#if data.margin.known}
		<section class="mt-6 rounded-[12px] border border-line-default bg-surface-card p-4">
			<dl class="flex flex-col gap-2">
				<div class="flex items-baseline justify-between gap-4">
					<dt class="text-[13px] text-ink-secondary">What you charged, before VAT</dt>
					<dd><Amount value={data.margin.margin.revenue} size="sm" /></dd>
				</div>
				{#each data.margin.margin.costs as cost (cost.kind)}
					<div class="flex items-baseline justify-between gap-4">
						<dt class="text-[13px] text-ink-secondary">{cost.label}</dt>
						<dd><Amount value={cost.amount} size="sm" /></dd>
					</div>
				{/each}
				<div
					class="mt-1 flex items-baseline justify-between gap-4 border-t border-line-default pt-3"
				>
					<dt class="text-ui text-ink">What you keep</dt>
					<dd><Amount value={data.margin.margin.keep} size="md" tone="settled" /></dd>
				</div>
			</dl>
			<p class="mt-3 text-helper text-ink-muted">{marginFootnote(data.fromInventory)}</p>
			{#if data.margin.margin.labourNote}
				<!-- A qualification, not a warning — muted, never the caveat's amber. -->
				<p class="mt-1 text-helper text-ink-muted">{data.margin.margin.labourNote}</p>
			{/if}
			{#if data.margin.margin.caveat}
				<p class="mt-1 text-helper text-attention-ink">{data.margin.margin.caveat}</p>
			{/if}
		</section>
	{:else}
		<p class="mt-6 text-ui text-ink-secondary">{data.margin.unavailable.reason}</p>
	{/if}

	<h2 class="mt-8 text-ui font-medium text-ink">The entries</h2>

	{#if data.lines.length === 0}
		<p class="mt-2 text-helper text-ink-muted">Nothing has been posted for this invoice yet.</p>
	{:else}
		<div class="mt-3 overflow-hidden rounded-[10px] border border-line-default">
			<table class="w-full border-collapse text-left">
				<caption class="sr-only">Ledger entries for this invoice.</caption>
				<thead class="bg-surface-card">
					<tr class="border-b border-line-default">
						<th scope="col" class="px-4 py-2.5 text-helper font-medium text-ink-muted">When</th>
						<th scope="col" class="px-4 py-2.5 text-helper font-medium text-ink-muted">What</th>
						<th scope="col" class="px-4 py-2.5 text-helper font-medium text-ink-muted">Where</th>
						<th scope="col" class="px-4 py-2.5 text-right text-helper font-medium text-ink-muted">
							Amount
						</th>
					</tr>
				</thead>
				<tbody>
					{#each data.lines as line, i (i)}
						<tr class="border-b border-line-row last:border-b-0">
							<td class="px-4 py-3 text-[13px] text-ink-secondary">
								{formatShortDate(line.occurredOn)}
							</td>
							<td class="px-4 py-3 text-ui text-ink">
								{ENTRIES[line.entryKind] ?? line.entryKind}
							</td>
							<td class="px-4 py-3 text-[13px] text-ink-secondary">
								{ACCOUNTS[line.account] ?? line.account}
							</td>
							<td class="px-4 py-3 text-right">
								<!--
									`signed` so a credit reads as a real minus rather than as a number that
									happens to be smaller. This is the one table in the product where the
									direction of every line is the information.
								-->
								<Amount value={line.amount} size="sm" signed />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="mt-3 text-helper text-ink-muted">
			Every entry balances to zero across its own lines — the database refuses to store one that
			does not.
		</p>
	{/if}
</div>
