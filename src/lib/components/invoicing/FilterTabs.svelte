<script lang="ts">
	/**
	 * `All 24 · Unpaid 6 · Overdue 0 · Paid 16 · Drafts 2`.
	 *
	 * Counts INLINE, not as badges — the design is specific about that, and a badge would give a
	 * zero count nowhere to go. `Overdue 0` is shown, because "'Overdue: none' is stated rather
	 * than hidden" is the rule this whole screen is built on.
	 *
	 * Real links, not buttons. The filter is in the URL, so a filtered list can be bookmarked,
	 * shared, reloaded and reached from Home's overdue standing point — which links straight to
	 * `?filter=overdue`. A click handler holding the state in a rune would break all four.
	 *
	 * Active: `--surface-raised`, radius 7px, weight 500, from the design.
	 */
	import { INVOICE_FILTERS, filterLabel, type InvoiceFilter } from '$lib/core/invoicing';

	let {
		active,
		counts,
		hrefFor
	}: {
		active: InvoiceFilter;
		counts: Readonly<Record<InvoiceFilter, number>>;
		hrefFor: (filter: InvoiceFilter) => string;
	} = $props();
</script>

<!--
	The hrefs are query strings on the current route, so there is no literal route id for
	`resolve()` to type-check against — the same situation as the row links in `InvoiceTable`.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<!--
	A tab list of links. `aria-current="page"` rather than the tab pattern's `aria-selected`,
	because these navigate — a screen reader should be told which page it is on, not which panel
	is showing.
-->
<nav class="mt-5 flex flex-wrap items-center gap-1" aria-label="Filter invoices">
	{#each INVOICE_FILTERS as filter (filter)}
		{@const isActive = filter === active}
		<a
			href={hrefFor(filter)}
			aria-current={isActive ? 'page' : undefined}
			data-active={isActive ? 'true' : undefined}
			class="rounded-[7px] px-3 py-1.5 text-ui transition-colors outline-none
				hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2
				focus-visible:outline-brand-focus-ring
				data-[active=true]:bg-surface-raised data-[active=true]:font-medium
				{isActive ? 'text-ink' : 'text-ink-secondary'}"
		>
			{filterLabel(filter)}
			<!--
				The count sits inside the link so it is read as part of the same control, and it is
				always rendered — a tab whose number vanished at zero would take the good news away
				exactly when there is some.
			-->
			<span class="ml-1 numeric text-ink-muted">{counts[filter]}</span>
		</a>
	{/each}
</nav>
