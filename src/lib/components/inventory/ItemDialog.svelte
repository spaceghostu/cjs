<script lang="ts">
	/**
	 * ADD OR EDIT AN ITEM.
	 *
	 * A DIALOG, not a route and not an autosaving editor. The quote and invoice editors autosave
	 * because a document is long-lived, resumable and externally visible — "you can close this and
	 * come back" is a promise about something being drafted over a session. An item is eight small
	 * fields, each valid on its own, finished in one sitting. Giving it a draft lifecycle would be
	 * inventing one to justify a UI. `RecordPaymentDialog` and `AddModuleDialog` are the precedent.
	 *
	 * ONE COMPONENT FOR BOTH MODES, so the field labels, the help text and the validation messages
	 * exist once. Two dialogs would drift within a month.
	 *
	 * THE OPENING QUANTITY IS NOT A LEVEL. It is offered only when creating, and the server turns
	 * it into one `opening` movement — which is the only honest answer to "where did 40 boards come
	 * from" on an item that did not exist a moment ago.
	 *
	 * A real `<form method="POST">`, progressively enhanced. Without JavaScript it still works,
	 * which for the button that brings a business's stock into existence is worth more than the
	 * animation it costs.
	 */
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		Button,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		Field,
		Input,
		MoneyField
	} from '$lib/ui';
	import { COMMON_UNITS, type InventoryItem } from '$lib/core/inventory';
	import { checkQuantity, checkUnitPrice } from '$lib/core/validation';
	import { quantityToDecimalString, unitPriceToDecimalString } from '$lib/core/money';

	let {
		open = $bindable(false),
		mode,
		item = null,
		sku = null,
		locationName = null,
		locations,
		message = null
	}: {
		open?: boolean;
		mode: 'create' | 'edit';
		item?: InventoryItem | null;
		sku?: string | null;
		locationName?: string | null;
		locations: readonly { id: string; name: string }[];
		/** A refusal from the server, shown where the person is looking rather than in a toast. */
		message?: string | null;
	} = $props();

	let busy = $state(false);

	const title = $derived(mode === 'create' ? 'Add an item' : 'Edit this item');
	const action = $derived(mode === 'create' ? '?/create' : '?/update');

	/**
	 * THE FOUR NUMERIC FIELDS ARE STATE, NOT DERIVED VALUES.
	 *
	 * They have to be, for the fields to be able to say anything about what is in them while
	 * somebody types. Seeded from the item through the sanctioned formatters — never `toFixed`,
	 * which is import-banned and would quietly turn `R33.333333` per board-metre into `R33.33`
	 * the moment somebody opened this dialog and saved without touching the field.
	 *
	 * Re-seeded ON OPEN AND ONLY ON OPEN. The read is wrapped in `untrack` so the effect depends
	 * on `open` alone: a later change to `item` — a reload, a sibling save — must not reach in
	 * and overwrite a number somebody is halfway through correcting. That is the same promise
	 * the rest of this ticket makes about invalid input, kept for valid input too.
	 */
	let cost = $state('');
	let sell = $state('');
	let reorderPoint = $state('');
	let openingQty = $state('');

	$effect(() => {
		if (!open) return;
		untrack(() => {
			cost = item?.costPrice ? unitPriceToDecimalString(item.costPrice) : '';
			sell = item?.sellPrice ? unitPriceToDecimalString(item.sellPrice) : '';
			reorderPoint = item ? quantityToDecimalString(item.reorderPoint) : '';
			openingQty = '';
		});
	});

	/**
	 * What the money core makes of each of them. A courtesy — the server parses every one of
	 * these again with the same functions — and blank is never a complaint here: all four are
	 * optional, and three of them say so in their own helper text.
	 */
	const costCheck = $derived(cost.trim() === '' ? null : checkUnitPrice(cost));
	const sellCheck = $derived(sell.trim() === '' ? null : checkUnitPrice(sell));
	const reorderCheck = $derived(reorderPoint.trim() === '' ? null : checkQuantity(reorderPoint));
	const openingCheck = $derived(openingQty.trim() === '' ? null : checkQuantity(openingQty));
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-lg">
		<form
			method="POST"
			{action}
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					// `reset: false` because four of these fields are bound state and the other four
					// are not. A native form reset clears the DOM value of an input whose value the
					// component is driving, leaving the price boxes looking empty while the state
					// behind them still holds what was just saved. `?/create` redirects and `?/update`
					// re-seeds on the next open, so there was nothing for the reset to do anyway.
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>
					{#if mode === 'create'}
						Anything you keep — a material, a part, a consumable. You can change all of it later.
					{:else}
						Details only. Quantities change by recording what moved, never by editing a number.
					{/if}
				</DialogDescription>
			</DialogHeader>

			{#if message}
				<p class="mt-3 text-ui text-wrong-ink" aria-live="polite">{message}</p>
			{/if}

			<div class="mt-4 flex flex-col gap-4">
				<Field label="Name" id="item-name">
					{#snippet control(field)}
						<Input
							{...field}
							name="name"
							value={item?.name ?? ''}
							placeholder="European oak, 40mm board"
							autocomplete="off"
							required
						/>
					{/snippet}
				</Field>

				<div class="grid grid-cols-2 gap-4">
					<Field label="Unit" id="item-unit">
						{#snippet control(field)}
							<!--
								A `<datalist>`, not a `<select>`. The suggestions cover most trades and none of
								them covers all — a joinery's board-metre and a cafe's punnet are the same
								concept, and a closed list would be wrong for one of them on day one.
							-->
							<Input
								{...field}
								name="unit"
								list="item-units"
								value={item?.unitOfMeasure ?? 'each'}
								autocomplete="off"
							/>
							<datalist id="item-units">
								{#each COMMON_UNITS as unit (unit)}
									<option value={unit}></option>
								{/each}
							</datalist>
						{/snippet}
					</Field>

					<Field label="Your code (optional)" id="item-sku">
						{#snippet control(field)}
							<Input
								{...field}
								name="sku"
								value={sku ?? ''}
								autocomplete="off"
								placeholder="OAK-40"
							/>
						{/snippet}
					</Field>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<!--
						`parseUnitPriceInput` reads these, in the browser as a courtesy and on the server
						as the decision — never `parseFloat`, which is import-banned for exactly these
						fields.
					-->
					<MoneyField
						label="What it costs you"
						id="item-cost"
						name="cost"
						bind:value={cost}
						result={costCheck}
						placeholder="1780.00"
						helper="Per {item?.unitOfMeasure ?? 'unit'}. Leave blank if you do not know."
					/>

					<MoneyField
						label="What you sell it for"
						id="item-sell"
						name="sell"
						bind:value={sell}
						result={sellCheck}
						placeholder="2400.00"
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<MoneyField
						label="Tell me when it drops below"
						id="item-reorder"
						name="reorderPoint"
						bind:value={reorderPoint}
						result={reorderCheck}
						placeholder="12"
						helper="Leave at 0 and we will not mention it."
					/>

					<Field label="Where it lives" id="item-location">
						{#snippet control(field)}
							<!--
								Free text with the existing places as suggestions, so a first item does not
								require visiting a settings screen that does not exist. The server matches an
								existing name case-insensitively before creating a new one.
							-->
							<Input
								{...field}
								name="locationName"
								value={locationName ?? ''}
								list="item-locations"
								autocomplete="off"
								placeholder="Rack A"
							/>
							<datalist id="item-locations">
								{#each locations as place (place.id)}
									<option value={place.name}></option>
								{/each}
							</datalist>
						{/snippet}
					</Field>
				</div>

				{#if mode === 'create'}
					<MoneyField
						label="How many have you got right now?"
						id="item-opening"
						name="openingQty"
						bind:value={openingQty}
						result={openingCheck}
						placeholder="40"
						helper="We record this as an opening balance, so the quantity always has a history behind it. Leave it blank if you would rather count later."
					/>
				{/if}
			</div>

			<DialogFooter class="mt-6">
				<Button type="button" variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy}>
					{busy ? 'Saving…' : mode === 'create' ? 'Add item' : 'Save changes'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
