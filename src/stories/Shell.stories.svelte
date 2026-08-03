<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AppSidebar from '$lib/components/shell/AppSidebar.svelte';
	import AppTopBar from '$lib/components/shell/AppTopBar.svelte';
	import MobileHeader from '$lib/components/shell/MobileHeader.svelte';
	import MobileNav from '$lib/components/shell/MobileNav.svelte';
	import { mobileNav, sidebarGroups } from '$lib/components/shell/nav';
	import { NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
	import { parseMoneyInput } from '$lib/core/money';
	import Specimen from './ui/Specimen.svelte';

	const { Story } = defineMeta({
		title: 'Shell/App shell',
		component: AppSidebar,
		parameters: { layout: 'fullscreen' }
	});

	/**
	 * Money through the only door a non-test file has: `parseMoneyInput`. The real total
	 * comes from `monthlyTotal()` in the server catalogue, which a story cannot import — and
	 * ESLint zone 5 keeps the constructor out of reach for exactly the reason that is a good
	 * thing.
	 */
	function money(input: string) {
		const parsed = parseMoneyInput(input);
		if (!parsed.ok) throw new Error(parsed.message);
		return parsed.value;
	}

	function owning(...keys: ModuleKey[]): AccessMap {
		return { ...NO_ACCESS, ...Object.fromEntries(keys.map((k) => [k, 'write' as const])) };
	}

	/** The design's tenant. Quoting, Invoicing and Inventory owned; Payroll offered. */
	const THORNHILL = owning('quoting', 'invoicing', 'inventory');
	const TOTAL = money('450.00');

	const tenant = {
		tradingName: 'Thornhill Joinery',
		initials: 'TJ',
		subtitle: 'Owner · Cape Town'
	};

	const person = { userInitials: 'BC', userName: 'Bongani Cele' };
</script>

<!--
	The four rows the design draws, and the three states they can be in. Every one of them is
	GENERATED from the catalogue plus an access map — which is the claim shell 1a was chosen
	on, so the stories vary the access map rather than the markup.
-->
<Story name="Sidebar · on Home" asChild>
	<Specimen title="Sidebar" note="Home active. Payroll locked, with the design's trailing Add.">
		<div class="flex h-[560px]">
			<AppSidebar {...tenant} groups={sidebarGroups(THORNHILL)} pathname="/" monthlyTotal={TOTAL} />
		</div>
	</Specimen>
</Story>

<Story name="Sidebar · inside a module" asChild>
	<Specimen
		title="Sidebar"
		note="Active state derives from the URL, so a detail route keeps its module lit."
	>
		<div class="flex h-[560px]">
			<AppSidebar
				{...tenant}
				groups={sidebarGroups(THORNHILL)}
				pathname="/invoicing/INV-2041"
				monthlyTotal={TOTAL}
			/>
		</div>
	</Specimen>
</Story>

<Story name="Sidebar · a removed module" asChild>
	<Specimen
		title="Sidebar"
		note="Payroll removed: still reachable, marked read-only. The design never draws this state — the middle one is why entitlement is not a boolean."
	>
		<div class="flex h-[560px]">
			<AppSidebar
				{...tenant}
				groups={sidebarGroups({ ...THORNHILL, payroll: 'read' })}
				pathname="/"
				monthlyTotal={TOTAL}
			/>
		</div>
	</Specimen>
</Story>

<Story name="Sidebar · a business with nothing" asChild>
	<Specimen
		title="Sidebar"
		note="No module owned. No Sales group, no Operations group — the catalogue drives the shell, so an empty business gets an empty shell rather than a row of dead links."
	>
		<div class="flex h-[560px]">
			<AppSidebar
				{...tenant}
				groups={sidebarGroups(NO_ACCESS)}
				pathname="/"
				monthlyTotal={money('0')}
			/>
		</div>
	</Specimen>
</Story>

<Story name="Top bar · AI on" asChild>
	<Specimen title="Top bar" note="The command bar is the only always-visible AI surface.">
		<div class="rounded-xl border border-line-subtle">
			<AppTopBar aiEnabled today="Thu, 12 Mar" {...person} onSearch={() => {}} />
		</div>
	</Specimen>
</Story>

<Story name="Top bar · AI off" asChild>
	<Specimen
		title="Top bar"
		note="Turning AI off removes the bar and nothing else. No nav item, action or route reads the flag."
	>
		<div class="rounded-xl border border-line-subtle">
			<AppTopBar aiEnabled={false} today="Thu, 12 Mar" {...person} onSearch={() => {}} />
		</div>
	</Specimen>
</Story>

<Story name="Mobile · header and nav" asChild>
	<Specimen
		title="Mobile shell"
		surface="sunken"
		note="390 × 844. The search field is 44px here against 34px on desktop: on a phone it is a touch target, not a hint."
	>
		<div
			class="flex h-[720px] w-[390px] flex-col overflow-hidden rounded-xl border border-line-subtle bg-surface-base"
		>
			<MobileHeader {...tenant} {...person} aiEnabled onSearch={() => {}} />
			<div class="flex-1"></div>
			<MobileNav nav={mobileNav(THORNHILL)} pathname="/" />
		</div>
	</Specimen>
</Story>

<Story name="Mobile · AI off" asChild>
	<Specimen
		title="Mobile shell"
		surface="sunken"
		note="Same removal as desktop. The bottom nav is untouched, so nothing became unreachable."
	>
		<div
			class="flex h-[720px] w-[390px] flex-col overflow-hidden rounded-xl border border-line-subtle bg-surface-base"
		>
			<MobileHeader {...tenant} {...person} aiEnabled={false} onSearch={() => {}} />
			<div class="flex-1"></div>
			<MobileNav nav={mobileNav(THORNHILL)} pathname="/invoicing" />
		</div>
	</Specimen>
</Story>
