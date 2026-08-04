<script lang="ts">
	/**
	 * THE MODULES SCREEN — the switcher's home, and the page it degrades to.
	 *
	 * Two surfaces, one list. The page states what this business has and what it pays; the
	 * switcher dialog is one button away and is where adding and removing actually happens.
	 * Both render `ModuleList`, and both read the same server data, so they cannot disagree
	 * about the catalogue or the total.
	 *
	 * WHY THE DIALOG HAS A BUTTON RATHER THAN OPENING ON ARRIVAL
	 * ---------------------------------------------------------
	 * A dialog needs somewhere to give focus back to. Opening one automatically on navigation
	 * leaves `Esc` with nowhere to return the caret, and leaves a keyboard user on a page they
	 * did not choose to have covered. The sidebar's "Add a module" row lands here; the button
	 * below opens the switcher, and closing it puts focus back on that button.
	 *
	 * WITHOUT JAVASCRIPT the page is still complete and still true: the rows, the prices, the
	 * total and the promise are all server-rendered, and the add and remove buttons post to
	 * the same three form actions the dialogs use.
	 */
	import { toast } from 'svelte-sonner';
	import { Amount, Button, Toaster } from '$lib/ui';
	import {
		AddModuleDialog,
		ModuleAddedToast,
		ModuleList,
		ModuleSwitcher,
		RemoveModuleDialog
	} from '$lib/components/modules';
	import type { ModuleKey } from '$lib/core/modules/catalogue';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let switcherOpen = $state(false);
	let confirmOpen = $state(false);
	let confirming = $state<{ key: ModuleKey; intent: 'add' | 'remove' } | null>(null);

	/** Every offer, flat — the confirmations look one up by key rather than by position. */
	const offers = $derived(data.groups.flatMap((group) => group.modules));
	const offer = $derived(confirming ? offers.find((m) => m.key === confirming?.key) : undefined);

	function startAdd(key: ModuleKey): void {
		switcherOpen = false;
		confirming = { key, intent: 'add' };
		confirmOpen = true;
	}

	function startRemove(key: ModuleKey): void {
		switcherOpen = false;
		confirming = { key, intent: 'remove' };
		confirmOpen = true;
	}

	/**
	 * The post-add toast, raised from the action's return value.
	 *
	 * `$effect` on `form` rather than a callback inside the dialog, because the toast belongs
	 * to the RESULT and not to the click: a form post without JavaScript lands here too, and a
	 * person who added a module in another tab should not be told about it in this one.
	 *
	 * `duration` is a minute, and there is a Dismiss button. The design asks for "a real
	 * dismissal window, not three seconds" — and the undo itself stays valid all day
	 * regardless, because removing a module you added today is the same free operation.
	 */
	// Deliberately NOT `$state`: the effect below both reads and writes it, and reactive state
	// used that way would re-run the effect it just settled.
	let announced: string | null = null;

	$effect(() => {
		const added = form && 'added' in form ? form.added : null;
		if (!added || announced === added.subscriptionId) return;

		announced = added.subscriptionId;
		const id = toast.custom(ModuleAddedToast, {
			duration: 60_000,
			componentProps: {
				label: added.label,
				destination: added.destination,
				carryover: added.carryover,
				subscriptionId: added.subscriptionId,
				onclose: () => toast.dismiss(id)
			}
		});
	});
</script>

<svelte:head><title>Modules · CJs</title></svelte:head>

<Toaster />

<div class="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
	<div>
		<h1 class="text-title text-ink">Modules</h1>
		<p class="mt-1 flex flex-wrap items-baseline gap-1 text-ui text-ink-secondary">
			<span>You have {data.ownedCount}, and you're paying</span>
			<Amount value={data.monthlyTotal} decimals={0} />
			<span>a month.</span>
		</p>
		<p class="mt-1 text-helper text-ink-muted">
			You're only charged for the days you have a module. Remove one and the next bill drops.
		</p>
	</div>

	{#if data.isOwner}
		<Button onclick={() => (switcherOpen = true)}>Add or remove a module</Button>
	{:else}
		<!--
			Staff see the catalogue and see that they cannot change it. That is a different and
			better answer than a screen they cannot reach — what a business pays for is not
			privileged information, and someone who cannot change it still has to know it.
		-->
		<p class="text-ui text-ink-secondary">
			Only an owner can add or remove modules. Everything your business has is below.
		</p>
	{/if}

	<div class="rounded-lg border border-line-default bg-surface-card p-2.5">
		<ModuleList
			groups={data.groups}
			canChange={data.isOwner}
			onadd={startAdd}
			onremove={startRemove}
		/>
	</div>
</div>

<ModuleSwitcher
	bind:open={switcherOpen}
	groups={data.groups}
	monthlyTotal={data.monthlyTotal}
	ownedCount={data.ownedCount}
	canChange={data.isOwner}
	onadd={startAdd}
	onremove={startRemove}
/>

<!--
	One confirmation at a time. Which one is mounted follows `confirming`; whether it is open
	follows `confirmOpen`, so Esc and Cancel close it with the animation the dialog was built
	with, and the next Add re-opens it with new figures rather than the ones it closed on.
-->
{#if offer && confirming?.intent === 'add' && offer.add}
	<AddModuleDialog
		bind:open={confirmOpen}
		moduleKey={offer.key}
		label={offer.label}
		accent={offer.accent}
		price={offer.price}
		currentTotal={data.monthlyTotal}
		newTotal={offer.add.newTotal}
		chargedToday={offer.add.chargedToday}
		daysCharged={offer.add.daysCharged}
		nextChargeLabel={offer.add.nextChargeLabel}
		arrivesWith={offer.add.arrivesWith}
	/>
{:else if offer && confirming?.intent === 'remove' && offer.remove}
	<RemoveModuleDialog
		bind:open={confirmOpen}
		moduleKey={offer.key}
		label={offer.label}
		accent={offer.accent}
		currentTotal={data.monthlyTotal}
		newTotal={offer.remove.newTotal}
		freeToday={offer.remove.freeToday}
		sinceLabel={offer.remove.sinceLabel}
	/>
{/if}
