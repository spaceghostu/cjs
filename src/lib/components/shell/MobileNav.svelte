<script lang="ts">
	/**
	 * Five slots at the bottom of a phone.
	 *
	 * Labels are ALWAYS visible. The shell decision that picked the sidebar over module tabs
	 * did so because tabs overflowing into a More menu "is recall, not recognition", and an
	 * icon with no label under it is the same trade made at a smaller size.
	 *
	 * The fifth slot is More whenever there is anything left over — see `mobileNav()`, which
	 * derives the split from owned modules rather than hardcoding the design's four.
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { accentText } from './accent';
	import { navIcon } from './icons';
	import { PLATFORM_ITEMS, isActive, type MobileNav, type NavItem } from './nav';

	let {
		nav,
		pathname
	}: {
		nav: MobileNav;
		pathname: string;
	} = $props();

	let moreOpen = $state(false);

	/** More is lit when the route you are on lives under it. */
	const overflowActive = $derived(nav.overflow.some((item) => isActive(pathname, item.href)));

	function labelFor(item: NavItem): string {
		return item.shortLabel;
	}
</script>

<!-- Same reason as `AppSidebar`: these hrefs are catalogue data, not route ids. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') moreOpen = false;
	}}
/>

{#if moreOpen}
	<!--
		A plain scrim, not a dialog: the sheet below is a nav list, and trapping focus in it
		would make the bottom bar itself unreachable while it is open.
	-->
	<button
		type="button"
		aria-label="Close menu"
		class="fixed inset-0 z-30 bg-surface-base/70"
		onclick={() => (moreOpen = false)}
	></button>
{/if}

<nav
	aria-label="Sections"
	class="relative z-40 border-t border-line-subtle bg-surface-sunken pt-2 pr-1 pb-3.5 pl-1"
>
	{#if moreOpen}
		<div
			class="absolute right-2 bottom-full left-2 mb-2 overflow-hidden rounded-xl border border-line-strong bg-surface-overlay"
		>
			{#each nav.overflow as item (item.key)}
				{@const Icon = navIcon(item.key)}
				<a
					href={item.href}
					onclick={() => (moreOpen = false)}
					class="flex h-11 items-center gap-3 border-b border-line-row px-4 text-ui text-ink"
				>
					<Icon size={18} aria-hidden="true" class="text-ink-muted" />
					<span class="flex-1">{item.label}</span>
					{#if item.access === 'none'}
						<span class="text-helper text-brand-ink">Add</span>
					{:else if item.access === 'read'}
						<span class="text-helper text-ink-muted">Read-only</span>
					{/if}
				</a>
			{/each}
			{#each PLATFORM_ITEMS as row (row.href)}
				<a
					href={row.href}
					data-sveltekit-reload={row.reload ? true : undefined}
					onclick={() => (moreOpen = false)}
					class="flex h-11 items-center px-4 text-ui text-ink-secondary not-last:border-b not-last:border-line-row"
				>
					{row.label}
				</a>
			{/each}
		</div>
	{/if}

	<ul class="flex items-stretch">
		{#each nav.items as item (item.key)}
			{@const active = isActive(pathname, item.href)}
			{@const Icon = navIcon(item.key)}
			<li class="flex-1">
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex h-11 flex-col items-center justify-center gap-1"
					class:text-ink={active}
					class:font-medium={active}
					class:text-ink-muted={!active}
				>
					<Icon size={20} aria-hidden="true" class={active ? accentText(item.accent) : undefined} />
					<span class="text-eyebrow tracking-normal normal-case">{labelFor(item)}</span>
				</a>
			</li>
		{/each}

		<!--
			More is ALWAYS here, even when no module overflowed. Settings, Export and Add a
			module never earn a slot of their own, and a phone that hid More on a business with
			three modules would be a phone with no way to reach its own settings.
		-->
		<li class="flex-1">
			<button
				type="button"
				aria-expanded={moreOpen}
				onclick={() => (moreOpen = !moreOpen)}
				class="flex h-11 w-full flex-col items-center justify-center gap-1"
				class:text-ink={moreOpen || overflowActive}
				class:font-medium={moreOpen || overflowActive}
				class:text-ink-muted={!moreOpen && !overflowActive}
			>
				<Ellipsis size={20} aria-hidden="true" />
				<span class="text-eyebrow tracking-normal normal-case">More</span>
			</button>
		</li>
	</ul>
</nav>
