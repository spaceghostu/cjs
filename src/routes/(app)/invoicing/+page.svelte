<script lang="ts">
	/**
	 * Three states, from entitlement — the same three the dynamic module route renders, because a
	 * static route that wins over it inherits its job:
	 *
	 *   none   never owned  — `LockedModule`. Calm, concrete, no urgency.
	 *   read   removed      — `RemovedModule`, above the invoices, which stay readable.
	 *   write  owned        — the module.
	 */
	import { enhance } from '$app/forms';
	import { Refusal } from '$lib/ui';
	import { InvoiceList } from '$lib/components/invoicing';
	import { LockedModule, RemovedModule } from '$lib/components/modules';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { defaultDirection, type InvoiceFilter, type InvoiceSort } from '$lib/core/invoicing';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let creating = $state(false);
	let createForm: HTMLFormElement | null = $state(null);
	let actionForm: HTMLFormElement | null = $state(null);
	let actionKind = $state<'remind' | 'markPaid'>('remind');
	let actionId = $state('');

	/** The filter and the page live in the URL, so every one of these is a real, shareable link. */
	function hrefFor(filter: InvoiceFilter): string {
		const params = new SvelteURLSearchParams();
		if (filter !== 'all') params.set('filter', filter);
		const query = params.toString();
		return query ? `?${query}` : '?';
	}

	function pageHref(page: number): string {
		const params = new SvelteURLSearchParams();
		if (data.filter !== 'all') params.set('filter', data.filter);
		if (data.sort !== 'due') params.set('sort', data.sort);
		if (data.direction !== 'asc') params.set('dir', data.direction);
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `?${query}` : '?';
	}

	/**
	 * Clicking a column heading.
	 *
	 * The column already sorted flips direction; a different one starts in its own natural
	 * direction — dates and amounts newest/biggest first, a name alphabetically. Paging resets,
	 * because page 4 of one order is nothing like page 4 of another.
	 */
	function sortHref(sort: InvoiceSort): string {
		const params = new SvelteURLSearchParams();
		if (data.filter !== 'all') params.set('filter', data.filter);

		const direction =
			data.sort === sort
				? data.direction === 'asc'
					? 'desc'
					: 'asc'
				: sort === 'due'
					? 'asc'
					: defaultDirection(sort);

		if (sort !== 'due') params.set('sort', sort);
		if (direction !== 'asc') params.set('dir', direction);

		const query = params.toString();
		return query ? `?${query}` : '?';
	}

	const exportHref = $derived(
		data.filter === 'all' ? '/invoicing/export' : `/invoicing/export?filter=${data.filter}`
	);

	/**
	 * Fire one of the card actions.
	 *
	 * Only the id crosses. "Mark paid" deliberately does NOT send an amount — the action works
	 * out the outstanding balance server-side, so a page left open while somebody else recorded
	 * a payment cannot double-record it.
	 */
	function submit(kind: 'remind' | 'markPaid', id: string) {
		actionKind = kind;
		actionId = id;
		// The action attribute is bound below, so the form has to re-render before it is submitted.
		queueMicrotask(() => actionForm?.requestSubmit());
	}
</script>

<svelte:head><title>Invoices · CJs</title></svelte:head>

{#if data.access === 'none'}
	<div class="mx-auto w-full max-w-2xl px-4 py-10 lg:py-16">
		<LockedModule
			moduleKey="invoicing"
			label={data.module.label}
			accent={data.module.accent}
			price={data.price}
			carryover={data.carryover}
		/>
	</div>
{:else}
	{#if data.access === 'read'}
		<div class="mx-auto w-full max-w-6xl px-4 pt-8 lg:px-8">
			<RemovedModule moduleKey="invoicing" label={data.module.label} accent={data.module.accent} />
		</div>
	{/if}

	{#if form?.message}
		<div class="mx-auto w-full max-w-6xl px-4 pt-4 lg:px-8">
			<Refusal message={form.message} />
		</div>
	{/if}

	<!--
		Real form POSTs, progressively enhanced. Without JavaScript they still work, which for the
		buttons that bring a document into existence and record money is worth more than the
		animation it costs.
	-->
	<form
		bind:this={createForm}
		method="POST"
		action="?/create"
		class="hidden"
		use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				await update();
				creating = false;
			};
		}}
	></form>

	<form
		bind:this={actionForm}
		method="POST"
		action="?/{actionKind}"
		class="hidden"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
			};
		}}
	>
		<input type="hidden" name="id" value={actionId} />
	</form>

	<InvoiceList
		invoices={data.invoices}
		counts={data.counts}
		filter={data.filter}
		today={data.today}
		summary={data.summary}
		owed={data.owed}
		dueThisWeek={data.dueThisWeek}
		overdue={data.overdue}
		page={data.page}
		pageCount={data.pageCount}
		sort={data.sort}
		direction={data.direction}
		{hrefFor}
		{pageHref}
		{sortHref}
		{exportHref}
		readOnly={data.access === 'read'}
		{creating}
		oncreate={() => createForm?.requestSubmit()}
		onremind={(id) => submit('remind', id)}
		onmarkpaid={(id) => submit('markPaid', id)}
	/>
{/if}
