<script lang="ts">
	/**
	 * THE MODULE SWITCHER.
	 *
	 * > "add and remove in the same place… Owned modules show Remove with equal weight to
	 * > Add."
	 *
	 * This dialog is where the product's central promise is either credible or not. Three
	 * things carry it, and all three are load-bearing rather than decorative:
	 *
	 *   THE ROWS       owned and available are equally reachable — see `ModuleRow`.
	 *   THE FOOTER     the running total, from the same function the sidebar reads.
	 *   THE PROMISE    "You're only charged for the days you have a module."
	 *
	 * WHY THE LAST LINE IS NOT DECORATION
	 * -----------------------------------
	 * "Owners and billing admins only" gates the buttons on `core_member.role`. Staff see the
	 * catalogue and see that they cannot change it — which is a different and better thing
	 * than a dialog they cannot open, because the answer to "what does this business pay for?"
	 * is not privileged information.
	 *
	 * The enforcement is `requireBillingAdmin` in `modules/subscribe.ts`. This is the courtesy.
	 */
	import {
		Amount,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogHeader,
		DialogTitle,
		Input
	} from '$lib/ui';
	import ModuleList, { type ListGroup } from './ModuleList.svelte';
	import { countModules, filterGroups } from './filter';
	import type { ModuleKey } from '$lib/core/modules/catalogue';
	import type { Money } from '$lib/core/money';

	let {
		open = $bindable(false),
		groups,
		monthlyTotal,
		ownedCount,
		canChange,
		onadd,
		onremove
	}: {
		open?: boolean;
		groups: readonly ListGroup[];
		monthlyTotal: Money;
		ownedCount: number;
		canChange: boolean;
		onadd: (key: ModuleKey) => void;
		onremove: (key: ModuleKey) => void;
	} = $props();

	let query = $state('');

	const shown = $derived(filterGroups(groups, query));
	const count = $derived(countModules(shown));

	/**
	 * The field is cleared on close rather than on open, so the dialog is never briefly
	 * showing a stale filter as it fades in.
	 */
	$effect(() => {
		if (!open) query = '';
	});
</script>

<Dialog bind:open>
	<!--
		760 x 740, `--surface-overlay`, `--border-strong`, 14px radius. The body scrolls; the
		header and footer do not — a person filtering a long catalogue must not lose the field
		they are typing into or the total they are deciding against.
	-->
	<DialogContent
		class="grid max-h-[740px] w-full max-w-[760px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-surface-overlay p-0 shadow-[0_24px_64px_rgba(0,0,0,.5)] sm:max-w-[760px]"
	>
		<DialogHeader class="gap-3 px-6 pt-6 pb-4 text-left">
			<DialogTitle class="text-section">Modules</DialogTitle>
			<DialogDescription class="text-ui text-ink-secondary">
				<!--
					Plain language, and a real count. "You have 3" is a fact about this business;
					"Manage your subscription" is a fact about nobody.
				-->
				You have {ownedCount}. Add or remove any of them here — one tap either way.
			</DialogDescription>

			<Input
				bind:value={query}
				class="h-9"
				type="search"
				placeholder="Find a module"
				aria-label="Find a module"
				aria-controls="module-switcher-list"
			/>
		</DialogHeader>

		<div id="module-switcher-list" class="overflow-y-auto px-2.5 pb-4">
			<ModuleList groups={shown} {canChange} {onadd} {onremove} />
		</div>

		<!-- Announced rather than drawn: the count changes as somebody types, and they can see it. -->
		<p aria-live="polite" class="sr-only">
			{count === 1 ? '1 module' : `${count} modules`}
		</p>

		<div
			class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-line-subtle bg-surface-card px-6 py-4"
		>
			<div class="min-w-0">
				<p class="flex items-baseline gap-1 text-ink">
					<Amount value={monthlyTotal} decimals={0} />
					<span class="text-ui font-medium">/month today</span>
				</p>
				<!--
					The proration promise, stated where the money is. It is the reason Remove is
					not a punishment, and it belongs next to the number it applies to.
				-->
				<p class="mt-1 text-helper text-ink-muted">
					You're only charged for the days you have a module. Remove one and the next bill drops.
				</p>
			</div>

			<p class="text-helper text-ink-muted">
				{canChange ? 'Owners and billing admins only' : 'Only an owner can change these'}
			</p>
		</div>
	</DialogContent>
</Dialog>
