<script lang="ts">
	/**
	 * THE SHELL.
	 *
	 * Two real layouts, one breakpoint, no tablet in between. The design draws a desktop
	 * shell and a 390 × 844 phone and nothing between them, so above the breakpoint the
	 * desktop shell renders and lets the CONTENT area do its own narrowing — a third,
	 * undesigned intermediate would be an invention.
	 *
	 * `lg` (1024px) is the breakpoint. The sidebar is 272px fixed, and below about 1000px the
	 * remaining column stops being enough for a table of line items.
	 *
	 * THE SHELL DOES NOT SCROLL
	 * -------------------------
	 * `h-svh` with `overflow-hidden` on the frame and `overflow-y-auto` on the one element
	 * that should move. `svh` rather than `vh` because mobile browsers lie about `vh` while
	 * their address bar is retracting, which puts the bottom nav under the chrome.
	 */
	import { page } from '$app/state';
	import { brandAttrs } from '$lib/ui';
	import AppSidebar from '$lib/components/shell/AppSidebar.svelte';
	import AppTopBar from '$lib/components/shell/AppTopBar.svelte';
	import CommandBar from '$lib/components/shell/CommandBar.svelte';
	import MobileHeader from '$lib/components/shell/MobileHeader.svelte';
	import MobileNav from '$lib/components/shell/MobileNav.svelte';
	import { mobileNav } from '$lib/components/shell/nav';
	import type { SearchGroup } from '$lib/core/search';
	import type { LayoutServerData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutServerData; children: Snippet } = $props();

	const pathname = $derived(page.url.pathname);
	const phoneNav = $derived(mobileNav(data.access));

	/**
	 * The one call the bar makes, and it is a GET that reads.
	 *
	 * Passed in as a function rather than fetched inside the component so the bar can be
	 * rendered in a story and asserted in a test without a server — and so there is exactly
	 * one place to look for what the command bar talks to.
	 */
	async function search(query: string): Promise<readonly SearchGroup[]> {
		const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
		if (!response.ok) return [];
		return (await response.json()) as SearchGroup[];
	}

	/**
	 * The single palette instance. Both triggers call into it.
	 *
	 * Null until it mounts, and null for the whole session when AI is off — which is why
	 * every caller is `?.` rather than `!`: with the bar gone the triggers are gone too, and
	 * nothing else in the shell reaches for it.
	 */
	let palette = $state<{ openBar: () => void } | null>(null);
</script>

<!--
	The brand attributes go on the shell root itself rather than in a `BrandScope` wrapper —
	which is what `BrandScope`'s own note asks for. Only `--brand` changes per tenant; the
	whole ramp re-derives from it in `layout.css`.
-->
<div
	{...brandAttrs(data.tenant.brandColor)}
	class="flex h-svh flex-col overflow-hidden bg-surface-base lg:flex-row"
>
	<!-- Desktop: the sidebar is the nav. -->
	<div class="hidden lg:flex">
		<AppSidebar
			tradingName={data.tenant.name}
			initials={data.tenant.initials}
			subtitle={data.tenant.subtitle}
			groups={data.nav}
			{pathname}
			monthlyTotal={data.monthlyTotal}
		/>
	</div>

	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<div class="hidden lg:block">
			<AppTopBar
				aiEnabled={data.aiEnabled}
				today={data.today}
				userInitials={data.person.initials}
				userName={data.person.name}
				onSearch={() => palette?.openBar()}
			/>
		</div>

		<div class="lg:hidden">
			<MobileHeader
				tradingName={data.tenant.name}
				initials={data.tenant.initials}
				userInitials={data.person.initials}
				userName={data.person.name}
				aiEnabled={data.aiEnabled}
				onSearch={() => palette?.openBar()}
			/>
		</div>

		<!-- The only thing that scrolls. -->
		<main class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</main>

		<div class="lg:hidden">
			<MobileNav nav={phoneNav} {pathname} />
		</div>
	</div>

	<!--
	One dialog for both triggers. The mobile header's 44px field and the top bar's 34px
	control are two ways into the same surface; mounting the palette per breakpoint would put
	two ⌘K listeners on the window, and the keystroke would open a dialog and toggle it shut
	in the same tick.

	Absent entirely when AI is off — and that removes the bar, not a capability: every
	destination it can reach is in the sidebar and the bottom nav, asserted in
	`search.test.ts` rather than assumed.
-->
	{#if data.aiEnabled}
		<CommandBar bind:this={palette} {search} />
	{/if}
</div>
