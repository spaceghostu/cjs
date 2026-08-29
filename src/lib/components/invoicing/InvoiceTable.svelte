<script lang="ts">
	/**
	 * THE INVOICES TABLE — the desktop composition.
	 *
	 * The design's six columns at `110px 1fr 110px 130px 140px 140px`: Invoice, Client, Issued,
	 * Due, Status, Amount.
	 *
	 * A REAL TABLE. `<table>`, `<th scope="col">`, one `<tr>` per invoice — because this IS
	 * tabular data, and a screen reader user navigating a grid of divs has no way to ask "what
	 * column am I in?". The row is made clickable by a link in the first cell that stretches over
	 * the row, which keeps one focusable element per row and a real href for middle-click, copy,
	 * and the keyboard.
	 *
	 * WHAT THE CELLS DO NOT DO
	 *   - No colour on an amount. Money is neutral; the exception is flagged in the STATUS column
	 *     and in the row background, and nowhere else.
	 *   - A draft shows `Draft` and `—`, never a fabricated number or a total nobody has priced.
	 *   - Dates are 13px secondary, and a due date inside its last two days goes `attention` —
	 *     the same threshold `statusCopy` uses, read from the same function.
	 */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import { Amount, Blank } from '$lib/ui';
	import {
		DUE_SOON_DAYS,
		statusCopy,
		type InvoiceListItem,
		type InvoiceSort,
		type SortDirection
	} from '$lib/core/invoicing';
	import { daysBetween, formatShortDate, type CalendarDate } from '$lib/core/calendar';
	import StatusBadge from './StatusBadge.svelte';

	let {
		invoices,
		today,
		sort,
		direction,
		sortHref
	}: {
		invoices: readonly InvoiceListItem[];
		today: CalendarDate;
		sort: InvoiceSort;
		direction: SortDirection;
		/** Where clicking a column heading goes. The sort lives in the URL — see `filter.ts`. */
		sortHref: (sort: InvoiceSort) => string;
	} = $props();

	/**
	 * Does this row need somebody's attention?
	 *
	 * Overdue, or due within two days. The design gives that row a `--surface-card` background —
	 * the quietest possible way to say "this one" without colouring the money.
	 */
	function needsAttention(invoice: InvoiceListItem): boolean {
		if (invoice.status === 'overdue') return true;
		if (invoice.status !== 'sent' && invoice.status !== 'viewed') return false;
		return invoice.dueDate !== null && daysBetween(today, invoice.dueDate) <= 2;
	}

	/** A near due date is the one date on this screen allowed a colour. */
	function dueClass(invoice: InvoiceListItem): string {
		if (invoice.status === 'overdue') return 'text-wrong-ink';
		if (invoice.status !== 'sent' && invoice.status !== 'viewed') return 'text-ink-secondary';
		if (invoice.dueDate === null) return 'text-ink-secondary';
		return daysBetween(today, invoice.dueDate) <= DUE_SOON_DAYS
			? 'text-attention-ink'
			: 'text-ink-secondary';
	}
</script>

<!--
	The row href carries an invoice id, so there is no literal route id for `resolve()` to
	type-check against — the same situation as the quotes list and Home's resume cards.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div class="mt-4 overflow-hidden rounded-[10px] border border-line-default">
	<table class="w-full border-collapse text-left">
		<caption class="sr-only">
			Your invoices, with what is owed on each and when it falls due.
		</caption>
		<colgroup>
			<col style="width: 110px" />
			<col />
			<col style="width: 110px" />
			<col style="width: 130px" />
			<col style="width: 140px" />
			<col style="width: 140px" />
		</colgroup>
		<thead class="bg-surface-card">
			<tr class="border-b border-line-default">
				<th scope="col" class="px-4 py-2.5 text-helper font-medium text-ink-muted">Invoice</th>
				{@render sortable('client', 'Client')}
				{@render sortable('issued', 'Issued')}
				{@render sortable('due', 'Due')}
				<th scope="col" class="px-4 py-2.5 text-helper font-medium text-ink-muted">Status</th>
				{@render sortable('amount', 'Amount', true)}
			</tr>
		</thead>
		<tbody>
			{#each invoices as invoice (invoice.id)}
				<tr
					class="relative border-b border-line-row last:border-b-0 hover:bg-surface-raised/40
						{needsAttention(invoice) ? 'bg-surface-card' : ''}"
				>
					<td class="px-4 py-3">
						<a
							href="/invoicing/{invoice.id}"
							class="numeric text-[13px] text-ink outline-none
								after:absolute after:inset-0 after:content-['']
								focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus-ring
								focus-visible:outline-solid"
						>
							{#if invoice.number}
								{invoice.number}
							{:else}
								<!-- A draft has no number, and inventing one would be a lie about a document. -->
								<span class="font-sans text-ink-muted">Draft</span>
							{/if}
						</a>
					</td>

					<td class="px-4 py-3 text-ui text-ink">
						{invoice.customerName ?? 'No client chosen yet'}
					</td>

					<td class="px-4 py-3 text-[13px] text-ink-secondary">
						{invoice.issueDate ? formatShortDate(invoice.issueDate) : '—'}
					</td>

					<td class="px-4 py-3 text-[13px] {dueClass(invoice)}">
						{invoice.dueDate ? formatShortDate(invoice.dueDate) : '—'}
					</td>

					<td class="px-4 py-3">
						<StatusBadge
							{today}
							facts={{
								status: invoice.status,
								dueDate: invoice.dueDate,
								paidOn: invoice.paidOn,
								hasAmount: invoice.hasAmount
							}}
						/>
					</td>

					<td class="px-4 py-3 text-right">
						{#if invoice.total}
							<Amount value={invoice.total} size="sm" />
						{:else}
							<!-- A draft's total is only knowable by pricing it, and the list is not the
							     place to price fifty documents nobody asked about. -->
							<Blank />
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<!--
	Read out for a screen reader, which cannot see that the badge and the row background are
	saying the same thing. Kept out of the visual flow so it does not repeat what is already
	on screen for everybody else.
-->
<p class="sr-only" aria-live="polite">
	{invoices.filter(
		(i) =>
			statusCopy(
				{ status: i.status, dueDate: i.dueDate, paidOn: i.paidOn, hasAmount: i.hasAmount },
				today
			).tone === 'wrong'
	).length}
	of {invoices.length} invoices on this page are overdue.
</p>

{#snippet sortable(column: InvoiceSort, label: string, right = false)}
	<!--
		`aria-sort` on the header, and the link inside it. A screen reader is told which column
		the table is ordered by and in which direction, which is the whole of what the visual
		chevron says to everybody else.
	-->
	<th
		scope="col"
		aria-sort={sort === column ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
		class="px-4 py-2.5 text-helper font-medium text-ink-muted {right ? 'text-right' : ''}"
	>
		<a
			href={sortHref(column)}
			class="inline-flex items-center gap-1 rounded-[4px] outline-none hover:text-ink
				focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid
				{sort === column ? 'text-ink' : ''}"
		>
			{label}
			{#if sort === column}
				{#if direction === 'asc'}
					<ChevronUp class="size-3" aria-hidden="true" />
				{:else}
					<ChevronDown class="size-3" aria-hidden="true" />
				{/if}
			{/if}
		</a>
	</th>
{/snippet}
