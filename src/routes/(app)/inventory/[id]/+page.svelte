<script lang="ts">
	/**
	 * One item: the quantity, then the ledger that produced it.
	 *
	 * No access branch here, unlike the list. This route lets `withModule` refuse — see the header
	 * comment on `+page.server.ts` for why the detail is `write` where the list is `read`.
	 */
	import { enhance } from '$app/forms';
	import { ItemDetail, ItemDialog } from '$lib/components/inventory';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let editing = $state(false);

	/**
	 * Archive and restore go through a real form POST, progressively enhanced — the same shape as
	 * the invoice list's card actions. Without JavaScript they still work, which for the button
	 * that takes something out of a business's stock list is worth more than the animation.
	 *
	 * The action attribute is bound reactively, so the form has to re-render before it is
	 * submitted; hence the `queueMicrotask`.
	 */
	let stateForm: HTMLFormElement | null = $state(null);
	let stateAction = $state<'archive' | 'restore'>('archive');

	function submit(kind: 'archive' | 'restore') {
		stateAction = kind;
		queueMicrotask(() => stateForm?.requestSubmit());
	}

	/** Reopen on a refusal, so the reason sits beside the work rather than replacing it. */
	$effect(() => {
		if (form?.message) editing = true;
	});

	function pageHref(page: number): string {
		const params = new SvelteURLSearchParams();
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `?${query}` : '?';
	}
</script>

<svelte:head><title>{data.item.name} · Stock · CJs</title></svelte:head>

{#if form?.message}
	<div class="mx-auto w-full max-w-5xl px-4 pt-4 lg:px-8">
		<p
			class="rounded-[10px] border border-wrong-border bg-wrong-tint px-4 py-3 text-ui text-wrong-ink"
			aria-live="polite"
		>
			{form.message}
		</p>
	</div>
{/if}

<form
	bind:this={stateForm}
	method="POST"
	action="?/{stateAction}"
	class="hidden"
	use:enhance={() =>
		async ({ update }) =>
			await update()}
></form>

<ItemDetail
	item={data.item}
	sku={data.sku}
	description={data.description}
	onHand={data.onHand}
	locationName={data.locationName}
	places={data.places}
	valueAtCost={data.valueAtCost}
	movements={data.movements}
	page={data.page}
	pageCount={data.pageCount}
	{pageHref}
	onedit={() => (editing = true)}
	onarchive={() => submit('archive')}
	onrestore={() => submit('restore')}
/>

<ItemDialog
	bind:open={editing}
	mode="edit"
	item={data.item}
	sku={data.sku}
	locationName={data.locationName}
	locations={data.locations}
	message={form?.message ?? null}
/>
