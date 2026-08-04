<script module lang="ts">
	/**
	 * THE MODULE SURFACES.
	 *
	 * Every story below varies DATA — an access map, a role, a catalogue — and never markup,
	 * because that is the claim the design makes about modularity and the only way to see
	 * whether the code keeps it. There is no module name anywhere in this file that is not
	 * derived from the catalogue.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AddModuleDialog from '$lib/components/modules/AddModuleDialog.svelte';
	import ContextualAdd from '$lib/components/modules/ContextualAdd.svelte';
	import LockedModule from '$lib/components/modules/LockedModule.svelte';
	import ModuleAddedToast from '$lib/components/modules/ModuleAddedToast.svelte';
	import ModuleList from '$lib/components/modules/ModuleList.svelte';
	import ModuleSwitcher from '$lib/components/modules/ModuleSwitcher.svelte';
	import RemoveModuleDialog from '$lib/components/modules/RemoveModuleDialog.svelte';
	import RemovedModule from '$lib/components/modules/RemovedModule.svelte';
	import {
		CATEGORY_LABELS,
		MODULE_CATEGORIES,
		modulesInCategory,
		NO_ACCESS,
		type AccessMap,
		type ModuleKey
	} from '$lib/core/modules/catalogue';
	import { parseMoneyInput } from '$lib/core/money';
	import Specimen from './ui/Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Modules/Switcher',
		component: ModuleSwitcher,
		parameters: { layout: 'fullscreen' }
	});

	/**
	 * Money through the only door a non-test file has. The real prices come from the SERVER
	 * catalogue, which a story cannot import — and ESLint zone 5 keeps the constructor out of
	 * reach for exactly the reason that is a good thing.
	 */
	function money(input: string) {
		const parsed = parseMoneyInput(input);
		if (!parsed.ok) throw new Error(parsed.message);
		return parsed.value;
	}

	/** The design's prices, restated here because the server's copy is unreachable. */
	const PRICES: Partial<Record<ModuleKey, string>> = {
		quoting: '120.00',
		invoicing: '150.00',
		bookings: '90.00',
		inventory: '180.00',
		scheduling: '110.00',
		payroll: '120.00'
	};

	function owning(...keys: ModuleKey[]): AccessMap {
		return { ...NO_ACCESS, ...Object.fromEntries(keys.map((k) => [k, 'write' as const])) };
	}

	/** The story-side stand-in for `catalogueGroups()`. Same shape, same order, same source. */
	function groupsFor(access: AccessMap) {
		return MODULE_CATEGORIES.flatMap((category) => {
			const modules = modulesInCategory(category).flatMap((row) => {
				const price = PRICES[row.key];
				return price
					? [
							{
								key: row.key,
								label: row.label,
								description: row.description,
								accent: row.accent,
								price: money(price),
								access: access[row.key]
							}
						]
					: [];
			});
			return modules.length > 0 ? [{ label: CATEGORY_LABELS[category], modules }] : [];
		});
	}

	/** The design's tenant: Quoting, Invoicing and Inventory, at R450 a month. */
	const THORNHILL = owning('quoting', 'invoicing', 'inventory');
	const EVERYTHING = owning(
		'quoting',
		'invoicing',
		'bookings',
		'inventory',
		'scheduling',
		'payroll'
	);

	const noop = () => {};
</script>

<!--
	The switcher as the design's tenant sees it: three owned rows on `--surface-raised` with
	their accents lit, three available rows with muted icons, and Remove sitting at exactly the
	same weight as Add.
-->
<Story name="Switcher · owner" asChild>
	<Specimen title="Module switcher" note="Owner. Remove has the same weight as Add.">
		<ModuleSwitcher
			open
			groups={groupsFor(THORNHILL)}
			monthlyTotal={money('450.00')}
			ownedCount={3}
			canChange
			onadd={noop}
			onremove={noop}
		/>
	</Specimen>
</Story>

<!--
	Staff see the catalogue and see that they cannot change it. The controls stay visible and
	reachable by a screen reader — `aria-disabled`, not removal — because what a business pays
	for is not privileged information.
-->
<Story name="Switcher · staff" asChild>
	<Specimen title="Module switcher" note="Staff. Controls unavailable, and the reason is stated.">
		<ModuleSwitcher
			open
			groups={groupsFor(THORNHILL)}
			monthlyTotal={money('450.00')}
			ownedCount={3}
			canChange={false}
			onadd={noop}
			onremove={noop}
		/>
	</Specimen>
</Story>

<Story name="Switcher · everything owned" asChild>
	<Specimen title="Module switcher" note="Nothing left to add. Every row offers Remove.">
		<ModuleSwitcher
			open
			groups={groupsFor(EVERYTHING)}
			monthlyTotal={money('770.00')}
			ownedCount={6}
			canChange
			onadd={noop}
			onremove={noop}
		/>
	</Specimen>
</Story>

<!--
	An empty catalogue is not an error state. It is what a switcher looks like before anything
	is for sale, and it has to be a sentence rather than a blank panel.
-->
<Story name="Switcher · empty catalogue" asChild>
	<Specimen title="Module switcher" note="Nothing purchasable. A sentence, not a blank panel.">
		<ModuleSwitcher
			open
			groups={[]}
			monthlyTotal={money('0.00')}
			ownedCount={0}
			canChange
			onadd={noop}
			onremove={noop}
		/>
	</Specimen>
</Story>

<!--
	Filtered. Rendered as the LIST rather than the dialog, because the filtering itself is
	`filterGroups` and is unit-tested — what a story is for here is the shape of a narrowed
	body, including a category that dropped out entirely.
-->
<Story name="Switcher · filtered" asChild>
	<Specimen title="Module list" note="Narrowed to the word invoice. Empty categories drop out.">
		<div class="w-[720px] rounded-lg border border-line-default bg-surface-card p-2.5">
			<ModuleList
				groups={groupsFor(THORNHILL).flatMap((g) => {
					const modules = g.modules.filter((m) =>
						`${m.label} ${m.description}`.toLowerCase().includes('invoice')
					);
					return modules.length > 0 ? [{ ...g, modules }] : [];
				})}
				canChange
				onadd={noop}
				onremove={noop}
			/>
		</div>
	</Specimen>
</Story>

<!--
	The confirmation. New total, not a delta; the proration in real figures; removal answered
	before it is asked; and what it arrives with, named.
-->
<Story name="Add confirmation" asChild>
	<Specimen title="Add a module" note="R450 → R570, prorated, with removal answered up front.">
		<AddModuleDialog
			open
			moduleKey="payroll"
			label="Payroll"
			accent="payroll"
			price={money('120.00')}
			currentTotal={money('450.00')}
			newTotal={money('570.00')}
			chargedToday={money('3.87')}
			daysCharged={1}
			nextChargeLabel="1 August"
			arrivesWith={[
				'Your company details and VAT number, already on every document',
				'4 people, already on your team',
				'Everything in Quoting, Invoicing and Inventory stays exactly as it is'
			]}
		/>
	</Specimen>
</Story>

<!-- The honest empty case: a business on its first afternoon has nothing to carry over. -->
<Story name="Add confirmation · nothing to carry over" asChild>
	<Specimen title="Add a module" note="A brand-new business. No invented carry-over.">
		<AddModuleDialog
			open
			moduleKey="quoting"
			label="Quoting"
			accent="quoting"
			price={money('120.00')}
			currentTotal={money('0.00')}
			newTotal={money('120.00')}
			chargedToday={money('120.00')}
			daysCharged={31}
			nextChargeLabel="1 September"
			arrivesWith={[]}
		/>
	</Specimen>
</Story>

<!-- The same dialog, inverted. Secondary confirm — nothing here is destroyed. -->
<Story name="Remove confirmation" asChild>
	<Specimen title="Remove a module" note="Same shape as Add, and never styled as destructive.">
		<RemoveModuleDialog
			open
			moduleKey="invoicing"
			label="Invoicing"
			accent="invoicing"
			currentTotal={money('450.00')}
			newTotal={money('300.00')}
			freeToday={false}
			sinceLabel="14 March"
		/>
	</Specimen>
</Story>

<Story name="Remove confirmation · added today" asChild>
	<Specimen title="Remove a module" note="Added today, so it costs nothing to take back.">
		<RemoveModuleDialog
			open
			moduleKey="invoicing"
			label="Invoicing"
			accent="invoicing"
			currentTotal={money('450.00')}
			newTotal={money('300.00')}
			freeToday
			sinceLabel="today"
		/>
	</Specimen>
</Story>

<Story name="Post-add toast" asChild>
	<Specimen title="Module added" note="Undo stays available, and dismissal is explicit.">
		<div class="w-[480px]">
			<ModuleAddedToast
				label="Payroll"
				destination="People"
				carryover="4 people and your VAT details"
				subscriptionId="story"
				onclose={noop}
			/>
		</div>
	</Specimen>
</Story>

<!--
	Locked. No primary CTA, no urgency, no lock icon — and the value stated concretely for
	THIS business rather than as a feature list.
-->
<Story name="Locked module" asChild>
	<Specimen title="Locked module" note="Calm. Secondary button, and it explains before it sells.">
		<div class="w-[560px]">
			<LockedModule
				moduleKey="payroll"
				label="Payroll"
				accent="payroll"
				price={money('120.00')}
				carryover="your 4 people"
			/>
		</div>
	</Specimen>
</Story>

<Story name="Locked module · nothing to promise yet" asChild>
	<Specimen title="Locked module" note="A new business. Nothing invented to make it sound fuller.">
		<div class="w-[560px]">
			<LockedModule
				moduleKey="bookings"
				label="Bookings"
				accent="bookings"
				price={money('90.00')}
				carryover={null}
			/>
		</div>
	</Specimen>
</Story>

<!--
	A REMOVED module is a different state and must not borrow the locked copy: the data is
	still here, and telling somebody otherwise on the screen they came to look it up on would
	be both wrong and alarming.
-->
<Story name="Removed module" asChild>
	<Specimen title="Removed module" note="Read-only and exportable. The data stayed.">
		<div class="w-[560px]">
			<RemovedModule moduleKey="payroll" label="Payroll" accent="payroll" />
		</div>
	</Specimen>
</Story>

<!--
	The contextual add, with the escape hatch that is the design's whole ethic:
	"…invoice it yourself — no module needed."
-->
<Story name="Contextual add" asChild>
	<Specimen title="Contextual add" note="Offered at the moment of need, with the way out below it.">
		<div class="w-[560px]">
			<ContextualAdd
				moduleKey="invoicing"
				label="Invoicing"
				accent="invoicing"
				headline="Turn it into an invoice"
				price={money('150.00')}
				newTotal={money('600.00')}
				escape={{
					label: 'download the accepted quote as a PDF and invoice it yourself',
					href: '#'
				}}
				onadd={noop}
			/>
		</div>
	</Specimen>
</Story>
