<script lang="ts">
	/**
	 * `All 48 · Running low 3 · Archived 2`.
	 *
	 * Counts INLINE, not as badges, and a zero count is SHOWN — the rule T20 states about
	 * `Overdue 0` applies here unchanged. "None running low" is the sentence an owner most wants
	 * to read, and a tab whose number vanished at zero would take the good news away exactly when
	 * there is some.
	 *
	 * Real links, not buttons. The filter is in the URL, so a filtered list can be bookmarked,
	 * shared and reloaded — and so Home's standing point can link straight to `?filter=low` when
	 * SPA-8 wires it up.
	 */
	import { INVENTORY_FILTERS, filterLabel, type InventoryFilter } from '$lib/core/inventory';

	let {
		active,
		counts,
		hrefFor
	}: {
		active: InventoryFilter;
		counts: Readonly<Record<InventoryFilter, number>>;
		hrefFor: (filter: InventoryFilter) => string;
	} = $props();
</script>

<!-- Query strings on the current route, so there is no route id for `resolve()` to check. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<!--
	`aria-current="page"` rather than the tab pattern's `aria-selected`, because these navigate —
	a screen reader should be told which page it is on, not which panel is showing.
-->
<nav class="mt-5 flex flex-wrap items-center gap-1" aria-label="Filter stock">
	{#each INVENTORY_FILTERS as filter (filter)}
		{@const isActive = filter === active}
		<a
			href={hrefFor(filter)}
			aria-current={isActive ? 'page' : undefined}
			data-active={isActive ? 'true' : undefined}
			class="rounded-[7px] px-3 py-1.5 text-ui transition-colors outline-none
				hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring
				focus-visible:outline-solid
				data-[active=true]:bg-surface-raised data-[active=true]:font-medium
				{isActive ? 'text-ink' : 'text-ink-secondary'}"
		>
			{filterLabel(filter)}
			<span class="ml-1 numeric text-ink-muted">{counts[filter]}</span>
		</a>
	{/each}
</nav>
