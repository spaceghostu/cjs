<script module lang="ts">
	/**
	 * THE INVOICES SCREEN, INSIDE THE GATE — SPA-16.
	 *
	 * Until this file no invoicing component had a story, so the error-severity a11y sweep in
	 * `.storybook/preview.ts` could not see the module's list surface at all. These stories
	 * put it there: the full desktop composition (a real `<table>` with `aria-sort`, the
	 * filter tabs with `aria-current`, the summary bar, the pagination `<nav>`), the read-only
	 * face a removed module keeps, the empty filter, and the two small pieces — badge and
	 * card — across their state matrices.
	 *
	 * `Invoicing/…` is a top-level category like `Home/…`: preview.ts's sweep notes name
	 * invoicing as a surface of its own, and `Shell/` already precedents a surface-level
	 * category. Callback props get no-ops and `?x=y` href builders, the same stubs
	 * `invoicing.mobile.spec.ts` uses.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import InvoiceCard from '$lib/components/invoicing/InvoiceCard.svelte';
	import InvoiceList from '$lib/components/invoicing/InvoiceList.svelte';
	import StatusBadge from '$lib/components/invoicing/StatusBadge.svelte';
	import Specimen from './ui/Specimen.svelte';
	import {
		COUNTS,
		INVOICE_ROWS,
		LIST_TOTALS,
		STATUS_FACTS,
		SUMMARY,
		TODAY
	} from './invoicing/fixtures';

	const { Story } = defineMeta({
		title: 'Invoicing/List',
		component: InvoiceList,
		parameters: { layout: 'fullscreen' }
	});

	const noop = () => {};

	const LIST_PROPS = {
		counts: COUNTS,
		filter: 'all' as const,
		today: TODAY,
		summary: SUMMARY,
		owed: LIST_TOTALS.owed,
		dueThisWeek: LIST_TOTALS.dueThisWeek,
		overdue: LIST_TOTALS.overdue,
		page: 1,
		pageCount: 2,
		sort: 'due' as const,
		direction: 'asc' as const,
		hrefFor: (filter: string) => `?filter=${filter}`,
		pageHref: (page: number) => `?page=${page}`,
		sortHref: (sort: string) => `?sort=${sort}`,
		exportHref: '/invoicing/export'
	};
</script>

<!-- The whole screen: table, tabs, summary bar, pagination. Both compositions are in the DOM. -->
<Story name="List" asChild>
	<div class="min-h-svh bg-surface-base">
		<InvoiceList
			{...LIST_PROPS}
			invoices={INVOICE_ROWS}
			oncreate={noop}
			onremind={noop}
			onmarkpaid={noop}
		/>
	</div>
</Story>

<!-- A removed module stays readable and exportable — but nothing here may write. -->
<Story name="List · read only" asChild>
	<div class="min-h-svh bg-surface-base">
		<InvoiceList {...LIST_PROPS} invoices={INVOICE_ROWS} readOnly />
	</div>
</Story>

<!-- Forty invoices filtered to nothing is a different sentence from no invoices at all. -->
<Story name="List · nothing under this filter" asChild>
	<div class="min-h-svh bg-surface-base">
		<InvoiceList
			{...LIST_PROPS}
			invoices={[]}
			filter="overdue"
			counts={{ ...COUNTS, overdue: 0 }}
			summary={{ unpaidCount: 4, overdueCount: 0, nextDue: { on: '2026-08-01', count: 1 } }}
			oncreate={noop}
		/>
	</div>
</Story>

<!-- Every branch of `statusCopy`: the words are the signal, never the colour alone. -->
<Story name="Status badges" asChild>
	<Specimen title="Status badges" note="The full matrix, words from the unit-tested copy.">
		<dl class="flex flex-col gap-3">
			{#each STATUS_FACTS as entry (entry.label)}
				<div class="flex items-center gap-4">
					<dt class="w-48 text-helper text-ink-muted">{entry.label}</dt>
					<dd><StatusBadge facts={entry.facts} today={TODAY} /></dd>
				</div>
			{/each}
		</dl>
	</Specimen>
</Story>

<!-- The phone's card: action buttons only on the one card that needs them. -->
<Story name="Cards" asChild>
	<Specimen title="Invoice cards" note="One actionable, one informational, one paid.">
		<div class="flex max-w-sm flex-col gap-3">
			<InvoiceCard
				invoice={INVOICE_ROWS[0]}
				today={TODAY}
				needsAction
				onremind={noop}
				onmarkpaid={noop}
			/>
			<InvoiceCard invoice={INVOICE_ROWS[1]} today={TODAY} />
			<InvoiceCard invoice={INVOICE_ROWS[4]} today={TODAY} />
		</div>
	</Specimen>
</Story>
