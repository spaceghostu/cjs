<script lang="ts">
	/**
	 * "— or pick from Inventory."
	 *
	 * The trigger and the dialog behind the last cell of the add-line row: a command palette
	 * over the business's own stock, in the `CommandBar.svelte` pattern. Selecting an item
	 * calls `onpick` and closes — the CALLER decides what a pick does to the draft, because
	 * the snapshot rules (`lineFromItem`) belong to quoting's core, not to a listbox.
	 *
	 * WHAT THIS COMPONENT DELIBERATELY DOES NOT SHOW: a stock figure. A quantity beside each
	 * row would imply picking reserves it, and nothing moves at quote time — that is the
	 * ticket's one hard promise. The price is shown because the price is what a pick copies.
	 *
	 * Unlike the command bar, the list here is loaded whole and filtered CLIENT-SIDE — bits-ui's
	 * own filtering stays on, matching on the item's name and sku through `keywords`.
	 */
	import { resolve } from '$app/paths';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Blank, UnitPrice } from '$lib/components/money';
	import type { PickableItem } from '$lib/core/inventory';

	let {
		items,
		onpick
	}: {
		items: readonly PickableItem[];
		onpick: (item: PickableItem) => void;
	} = $props();

	let open = $state(false);

	/**
	 * Where focus was before the dialog opened. The trigger below is a plain button rather
	 * than a bits-ui `Dialog.Trigger`, so the restore is made by hand — the same arrangement,
	 * for the same reason, as `CommandBar.svelte`. An effect rather than an `onOpenChange`
	 * prop because `Command.Dialog` spreads its rest props into both the dialog and the
	 * command root, and this reacts to `open` however it changed — Esc, the overlay, a pick.
	 */
	let restoreFocusTo: HTMLElement | null = null;

	function openPicker(): void {
		restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		open = true;
	}

	$effect(() => {
		if (open) return;

		const previous = restoreFocusTo;
		restoreFocusTo = null;
		previous?.focus();
	});

	function pick(item: PickableItem): void {
		onpick(item);
		// Focus lands back on the trigger — one Enter away from picking the next item.
		open = false;
	}
</script>

<button
	type="button"
	class="rounded-sm text-ui text-brand-ink underline underline-offset-2 outline-none hover:text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
	onclick={openPicker}
>
	pick from Inventory
</button>

<Command.Dialog bind:open title="Pick from Inventory" description="Add a stock item to this quote.">
	{#if items.length === 0}
		<!--
			Owned, but nothing in it yet. The dialog still opens — a button that silently does
			nothing reads as broken — and points at the screen where stock is added.
		-->
		<p class="px-6 py-8 text-center text-ui text-ink-secondary">
			Nothing in Inventory yet.
			<a
				href={resolve('/inventory')}
				class="rounded-sm text-brand-ink underline underline-offset-2 outline-none hover:text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
			>
				Add your first item
			</a>
			and it will be here to pick.
		</p>
	{:else}
		<!--
			bits-ui gives the input role="combobox" and aria-expanded but no aria-controls,
			which ARIA requires. Only the caller knows the id of the list, so the pairing is
			made here — same as the command bar and the T02 story.
		-->
		<Command.Input placeholder="Search your items…" aria-controls="inventory-picker-results" />
		<Command.List id="inventory-picker-results">
			<Command.Empty>Nothing in Inventory matches that.</Command.Empty>
			{#each items as item (item.id)}
				<!--
					`value` is the id so two identically-named items stay distinct entries;
					`keywords` is what the person actually types — the name, and the sku when
					there is one.
				-->
				<Command.Item
					value={item.id}
					keywords={item.sku ? [item.name, item.sku] : [item.name]}
					onSelect={() => pick(item)}
				>
					<span class="min-w-0 flex-1 truncate">{item.name}</span>
					{#if item.sku}
						<span class="shrink-0 text-helper text-ink-muted">{item.sku}</span>
					{/if}
					<span class="ml-auto flex shrink-0 items-baseline gap-1">
						{#if item.sellPrice !== null}
							<UnitPrice value={item.sellPrice} />
						{:else}
							<!-- "Not priced yet", never R0 — the pick leaves the field to type. -->
							<Blank kind="unknown" />
						{/if}
						{#if item.unitOfMeasure !== 'each'}
							<span class="text-helper text-ink-muted">/ {item.unitOfMeasure}</span>
						{/if}
					</span>
				</Command.Item>
			{/each}
		</Command.List>
	{/if}
</Command.Dialog>
