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

	/**
	 * The More button itself, so closing the sheet can put focus back on it.
	 *
	 * Every row in the sheet lives inside `{#if moreOpen}`, so closing it DESTROYS whatever
	 * element the keyboard was on. Without this, the browser has nowhere to put focus and
	 * drops it on <body>: the next Tab starts again from the top of the document, which for
	 * someone who just navigated the whole nav to reach More is the entire journey again.
	 */
	let moreButton = $state<HTMLButtonElement | null>(null);

	function closeMore(): void {
		moreOpen = false;
		moreButton?.focus();
	}

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
		// Guarded on `moreOpen`, not just on the key. This listener is on the WINDOW and the
		// nav is mounted on every phone route, so an unguarded handler would yank focus onto
		// the More button every time anyone pressed Escape anywhere in the product — closing
		// a dialog, clearing a search field, abandoning a menu that has nothing to do with us.
		if (event.key === 'Escape' && moreOpen) closeMore();
	}}
/>

{#if moreOpen}
	<!--
		A plain scrim, not a dialog: the sheet below is a nav list, and trapping focus in it
		would make the bottom bar itself unreachable while it is open.

		`tabindex="-1"` because it is a pointer affordance only. It is `fixed inset-0`, so the
		2px ring at 2px offset that every other control here carries would draw a rectangle
		around the whole viewport — and it would be the FIRST thing Tab reached, since the
		scrim precedes the nav in the document. Keyboard users close the sheet with Escape,
		which the handler above already does, or by tabbing past it. Nothing is lost by taking
		it out of the tab order; the click target stays exactly as it was.
	-->
	<button
		type="button"
		tabindex="-1"
		aria-label="Close menu"
		class="fixed inset-0 z-30 bg-surface-base/70"
		onclick={closeMore}
	></button>
{/if}

<nav
	aria-label="Sections"
	class="relative z-40 border-t border-line-subtle bg-surface-sunken pt-2 pr-1 pb-3.5 pl-1"
>
	<ul class="flex items-stretch">
		{#each nav.items as item (item.key)}
			{@const active = isActive(pathname, item.href)}
			{@const Icon = navIcon(item.key)}
			<li class="flex-1">
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex h-11 flex-col items-center justify-center gap-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
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
				bind:this={moreButton}
				type="button"
				aria-expanded={moreOpen}
				onclick={() => (moreOpen = !moreOpen)}
				class="flex h-11 w-full flex-col items-center justify-center gap-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
				class:text-ink={moreOpen || overflowActive}
				class:font-medium={moreOpen || overflowActive}
				class:text-ink-muted={!moreOpen && !overflowActive}
			>
				<Ellipsis size={20} aria-hidden="true" />
				<span class="text-eyebrow tracking-normal normal-case">More</span>
			</button>
		</li>
	</ul>

	<!--
		The sheet comes AFTER the bar in the document, which is the whole reason it is down
		here rather than above the <ul> where it started.

		It is `absolute bottom-full` against a `relative` <nav>, so where it PAINTS has nothing
		to do with where it sits in the markup — it renders above the bar either way, and a
		later sibling paints on top, which is the safer of the two orders. What sibling order
		decides is the tab sequence. Declared first, the sheet preceded the button that opens
		it: pressing Enter on More opened a menu that forward-Tab could never reach, because
		Tab went on past the nav entirely and the rows were only reachable by shift-Tabbing
		back through all five links. Declared last, Tab from More lands on the first row, which
		is what someone who just opened a menu is asking for.
	-->
	{#if moreOpen}
		<div
			class="absolute right-2 bottom-full left-2 mb-2 overflow-hidden rounded-xl border border-line-strong bg-surface-overlay"
		>
			{#each nav.overflow as item (item.key)}
				{@const Icon = navIcon(item.key)}
				<a
					href={item.href}
					onclick={() => (moreOpen = false)}
					class="flex h-11 items-center gap-3 border-b border-line-row px-4 text-ui text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
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
					class="flex h-11 items-center px-4 text-ui text-ink-secondary outline-none not-last:border-b not-last:border-line-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
				>
					{row.label}
				</a>
			{/each}

			<!--
				A POST, not a link — see `sign-out/+page.server.ts`. A GET that ends a session can
				fire from a prefetch or a link scanner, so this is the one row here that is a form.
			-->
			<form method="POST" action="/sign-out" class="border-t border-line-row">
				<button
					type="submit"
					class="flex h-11 w-full items-center px-4 text-left text-ui text-ink-secondary outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus-ring focus-visible:outline-solid"
				>
					Sign out
				</button>
			</form>
		</div>
	{/if}
</nav>
