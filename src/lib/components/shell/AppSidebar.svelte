<script lang="ts">
	/**
	 * SHELL 1a — the sidebar the design marks recommended.
	 *
	 * "Every module is a visible, labelled destination. Catalogue can grow without reshaping
	 * the shell." The alternative, 1b, is documented as breaking past ~6 modules where tabs
	 * overflow into a More menu — "which is recall, not recognition". 1b is not built.
	 *
	 * Every group and every row here comes from `sidebarGroups()`, which reads the catalogue
	 * and one access map. There is no list of modules in this file, which is the whole point
	 * of having chosen 1a.
	 *
	 * `pathname` is a PROP rather than a read of `$app/state`, so the sidebar renders in a
	 * story and in a test without a router. The layout passes `page.url.pathname`.
	 */
	import { Amount } from '$lib/ui';
	import type { Money } from '$lib/core/money';
	import { accentText } from './accent';
	import { navIcon } from './icons';
	import { MODULES_HREF, PLATFORM_ITEMS, isActive, type NavGroup } from './nav';

	let {
		tradingName,
		initials,
		/** "Owner · Cape Town" — role and location, from `core_member` and `core_business`. */
		subtitle,
		groups,
		pathname,
		monthlyTotal
	}: {
		tradingName: string;
		initials: string;
		subtitle: string;
		groups: readonly NavGroup[];
		pathname: string;
		monthlyTotal: Money;
	} = $props();
</script>

<!--
	Every href below is catalogue DATA (`/quoting`, `/payroll`), not a literal route id, so
	`resolve()` has nothing to type-check against: the module routes are all served by one
	dynamic `[module=module]` route. There is no `paths.base` in `svelte.config.js`, and if
	one is ever added the fix belongs in the nav model where the hrefs are built, not in
	seven call sites here and in `MobileNav`.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

<!--
	272px, fixed. The shell does not scroll; the content area does — so this is a column with
	its own overflow, and the footer is pinned by `mt-auto` rather than by position.
-->
<nav
	aria-label="Modules"
	class="flex w-[272px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-line-subtle bg-surface-sunken pt-[18px] pr-3.5 pb-4 pl-3.5"
>
	<div class="flex items-center gap-2.5 px-1">
		<!--
			The tenant square carries initials, never a logo upload: the design has no logo, and
			a missing image on the shell of every screen is worse than two letters.
		-->
		<span
			aria-hidden="true"
			class="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-surface-raised text-helper font-medium text-ink"
		>
			{initials}
		</span>
		<span class="min-w-0">
			<span class="block truncate text-ui font-medium text-ink">{tradingName}</span>
			<span class="block truncate text-helper text-ink-muted">{subtitle}</span>
		</span>
	</div>

	<div class="flex flex-col gap-[18px]">
		{#each groups as group (group.label ?? '__home')}
			<div class="flex flex-col gap-0.5">
				{#if group.label}
					<h2 class="px-2.5 pb-1.5 eyebrow">{group.label}</h2>
				{/if}

				{#each group.items as item (item.key)}
					{@const active = isActive(pathname, item.href)}
					{@const locked = item.access === 'none'}
					{@const Icon = navIcon(item.key)}
					<a
						href={item.href}
						aria-current={active ? 'page' : undefined}
						class="flex h-[38px] items-center gap-2.5 rounded-md px-2.5 text-ui transition-colors duration-150 ease-out-forward outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
						class:bg-surface-raised={active}
						class:font-medium={active}
						class:text-ink={active}
						class:text-ink-secondary={!active && !locked}
						class:text-ink-muted={locked}
						class:hover:bg-surface-raised={!active}
					>
						<!--
							The icon takes the module's accent ONLY on the active row. The design's own
							source has a no-op ternary that gives an owned-inactive icon and a locked one
							the same colour, and that reads as intended rather than as a slip: a column
							of seven accents is a field of colour, and the design is explicit that
							accents are wayfinding. So one accent at a time, on the row you are on.
						-->
						<Icon
							size={17}
							strokeWidth={1.75}
							aria-hidden="true"
							class={active ? accentText(item.accent) : 'text-ink-muted'}
						/>
						<span class="min-w-0 flex-1 truncate">{item.label}</span>

						{#if locked}
							<!--
								The design's locked affordance. Not a lock icon: the row is an offer, and
								the calm word for an offer is what it costs you to accept it.
							-->
							<span class="text-helper text-brand-ink">Add</span>
						{:else if item.access === 'read'}
							<!--
								Not in the design, because the design never draws a removed module. It has
								to say something, though: "your payroll data stays yours" means this row
								still works, and a row that looks owned but refuses every edit is worse
								than one that said so. T13 refines the affordance.
							-->
							<span class="text-helper text-ink-muted">Read-only</span>
						{/if}
					</a>
				{/each}
			</div>
		{/each}
	</div>

	<div class="mt-auto flex flex-col gap-0.5 border-t border-line-subtle pt-3">
		<!--
			The same three rows the phone puts under More, from the same list — so "is Settings
			reachable without the command bar?" has one place to look.

			The running total beside "Add a module" is `monthlyTotal()` from the server
			catalogue, which is also what T11's switcher reads: two sums of someone's monthly
			bill are two chances to disagree on screen.
		-->
		{#each PLATFORM_ITEMS as row (row.href)}
			<a
				href={row.href}
				data-sveltekit-reload={row.reload ? true : undefined}
				aria-current={pathname === row.href ? 'page' : undefined}
				class="flex h-[34px] items-center gap-2.5 rounded-md px-2.5 text-ui text-ink-secondary transition-colors duration-150 ease-out-forward outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus-ring"
			>
				<span class="flex-1">{row.label}</span>
				{#if row.href === MODULES_HREF}
					<span class="flex items-baseline text-ink-muted">
						<Amount value={monthlyTotal} size="sm" tone="muted" decimals={0} />
						<span class="text-helper">/mo</span>
					</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>
