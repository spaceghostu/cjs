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
	import { enhance } from '$app/forms';
	import {
		Button,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		Input,
		Label
	} from '$lib/ui';
	import { COMMON_UNITS, type InventoryItem } from '$lib/core/inventory';
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
	 * Existing values as a person would type them.
	 *
	 * Through the sanctioned formatters, never `toFixed` — which is import-banned, and would
	 * quietly turn `R33.333333` per board-metre into `R33.33` the moment somebody opened the
	 * dialog and saved without touching the field.
	 */
	const costValue = $derived(item?.costPrice ? unitPriceToDecimalString(item.costPrice) : '');
	const sellValue = $derived(item?.sellPrice ? unitPriceToDecimalString(item.sellPrice) : '');
	const reorderValue = $derived(item ? quantityToDecimalString(item.reorderPoint) : '');
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-lg">
		<form
			method="POST"
			{action}
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
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
				<div>
					<Label for="item-name">Name</Label>
					<div class="mt-1.5">
						<Input
							id="item-name"
							name="name"
							value={item?.name ?? ''}
							placeholder="European oak, 40mm board"
							autocomplete="off"
							required
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="item-unit">Unit</Label>
						<div class="mt-1.5">
							<!--
								A `<datalist>`, not a `<select>`. The suggestions cover most trades and none of
								them covers all — a joinery's board-metre and a cafe's punnet are the same
								concept, and a closed list would be wrong for one of them on day one.
							-->
							<Input
								id="item-unit"
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
						</div>
					</div>

					<div>
						<Label for="item-sku">Your code <span class="text-ink-muted">(optional)</span></Label>
						<div class="mt-1.5">
							<Input
								id="item-sku"
								name="sku"
								value={sku ?? ''}
								autocomplete="off"
								placeholder="OAK-40"
							/>
						</div>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<!--
							`inputmode="decimal"` so a phone offers the right keypad. Parsed by
							`parseUnitPriceInput` on the server — never `parseFloat`, which is import-banned
							for exactly this field.
						-->
						<Label for="item-cost">What it costs you</Label>
						<div class="mt-1.5">
							<Input
								id="item-cost"
								name="cost"
								value={costValue}
								inputmode="decimal"
								autocomplete="off"
								placeholder="1780.00"
							/>
						</div>
						<p class="mt-1 text-helper text-ink-muted">
							Per {item?.unitOfMeasure ?? 'unit'}. Leave blank if you do not know.
						</p>
					</div>

					<div>
						<Label for="item-sell">What you sell it for</Label>
						<div class="mt-1.5">
							<Input
								id="item-sell"
								name="sell"
								value={sellValue}
								inputmode="decimal"
								autocomplete="off"
								placeholder="2400.00"
							/>
						</div>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<Label for="item-reorder">Tell me when it drops below</Label>
						<div class="mt-1.5">
							<Input
								id="item-reorder"
								name="reorderPoint"
								value={reorderValue}
								inputmode="decimal"
								autocomplete="off"
								placeholder="12"
							/>
						</div>
						<p class="mt-1 text-helper text-ink-muted">Leave at 0 and we will not mention it.</p>
					</div>

					<div>
						<Label for="item-location">Where it lives</Label>
						<div class="mt-1.5">
							<!--
								Free text with the existing places as suggestions, so a first item does not
								require visiting a settings screen that does not exist. The server matches an
								existing name case-insensitively before creating a new one.
							-->
							<Input
								id="item-location"
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
						</div>
					</div>
				</div>

				{#if mode === 'create'}
					<div>
						<Label for="item-opening">How many have you got right now?</Label>
						<div class="mt-1.5">
							<Input
								id="item-opening"
								name="openingQty"
								inputmode="decimal"
								autocomplete="off"
								placeholder="40"
							/>
						</div>
						<p class="mt-1 text-helper text-ink-muted">
							We record this as an opening balance, so the quantity always has a history behind it.
							Leave it blank if you would rather count later.
						</p>
					</div>
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
