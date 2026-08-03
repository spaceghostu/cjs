/**
 * THE NAV MODEL — the whole reason shell 1a was chosen.
 *
 * The design presents two shells and picks the sidebar: "Every module is a visible, labelled
 * destination. Catalogue can grow without reshaping the shell." That promise is kept here or
 * nowhere. Everything below derives from the catalogue and one access map; there is no list
 * of modules in a component, and adding an eighth module touches this file zero times.
 *
 * Pure on purpose. The desktop sidebar, the mobile bottom nav and the command bar's
 * navigation results all read the same three functions, so they cannot disagree about what
 * this business can reach — and all three can be tested without a browser, a session or a
 * database.
 */
import {
	CATEGORY_LABELS,
	HOME,
	MODULE_CATEGORIES,
	modulesInCategory,
	type Access,
	type AccessMap,
	type ModuleCategory,
	type ModuleKey
} from '$lib/core/modules/catalogue';

/** `home` is a destination, not a module — see the note on `HOME` in the catalogue. */
export type NavKey = ModuleKey | typeof HOME.key;

export type NavItem = {
	readonly key: NavKey;
	readonly label: string;
	/** The one-word form the 11px bottom-nav label has room for. */
	readonly shortLabel: string;
	readonly href: string;
	/** Tailwind colour name — `text-quoting`. Never a hex value; see the catalogue. */
	readonly accent: string;
	/**
	 * `write` owned, `read` removed-but-readable, `none` never owned.
	 *
	 * Home is always `write`: it is not a module, so there is nothing to own. Modelling it as
	 * anything else would make every consumer special-case the one row that cannot be locked.
	 */
	readonly access: Access;
};

export type NavGroup = {
	/** Null for the unlabelled first group, which holds Home alone. */
	readonly label: string | null;
	readonly items: readonly NavItem[];
};

const HOME_ITEM: NavItem = Object.freeze({
	key: HOME.key,
	label: HOME.label,
	shortLabel: HOME.shortLabel,
	href: HOME.href,
	accent: HOME.accent,
	access: 'write'
});

/**
 * Does this module get a nav row at all?
 *
 * Owned or previously owned, always — a business must be able to reach the data it is paying
 * for, and the archive of the data it stopped paying for. Never owned, only when the
 * catalogue offers it: the design's sidebar carries Payroll locked with a trailing "Add" as
 * a standing offer, and which modules earn that offer is a catalogue decision rather than a
 * shell one. See `offeredWhenLocked`.
 */
function isVisible(key: ModuleKey, access: AccessMap, offeredWhenLocked: boolean): boolean {
	return access[key] !== 'none' || offeredWhenLocked;
}

function itemsFor(category: ModuleCategory, access: AccessMap): NavItem[] {
	return modulesInCategory(category)
		.filter((m) => isVisible(m.key, access, m.offeredWhenLocked))
		.map((m) => ({
			key: m.key,
			label: m.label,
			shortLabel: m.shortLabel,
			href: m.href,
			accent: m.accent,
			access: access[m.key]
		}));
}

/**
 * The sidebar: Home in an unlabelled group, then one group per category that has anything
 * in it.
 *
 * An empty group is omitted rather than rendered with a heading and nothing under it — "a
 * business owning no Operations module shows no Operations group".
 */
export function sidebarGroups(access: AccessMap): readonly NavGroup[] {
	const groups: NavGroup[] = [{ label: null, items: [HOME_ITEM] }];

	for (const category of MODULE_CATEGORIES) {
		const items = itemsFor(category, access);
		if (items.length > 0) groups.push({ label: CATEGORY_LABELS[category], items });
	}

	return groups;
}

/** Every nav destination, flat and in sidebar order. Home first. */
export function navItems(access: AccessMap): readonly NavItem[] {
	return sidebarGroups(access).flatMap((g) => g.items);
}

/**
 * Five slots at the bottom of a phone, and the fifth is "More" the moment there are more
 * than four destinations.
 *
 * The design's five are Home, Quotes, Invoices, Stock, More — four destinations plus the
 * overflow, for a tenant whose sidebar has five rows (Payroll is the fifth, and it is what
 * More opens). So the rule is FOUR destinations, not five: the row is five items wide, and
 * the fifth is More whenever there is anything left over.
 *
 * Stated in terms of that shape rather than that list, because the list is generated.
 */
export const MOBILE_SLOTS = 5;

/** Destinations that keep a slot of their own. The remaining slot belongs to More. */
export const MOBILE_DESTINATIONS = MOBILE_SLOTS - 1;

export type MobileNav = {
	readonly items: readonly NavItem[];
	/** What "More" opens. Empty when everything fitted, and then More is not rendered. */
	readonly overflow: readonly NavItem[];
};

export function mobileNav(access: AccessMap): MobileNav {
	const all = navItems(access);
	if (all.length <= MOBILE_DESTINATIONS) return { items: all, overflow: [] };

	return {
		items: all.slice(0, MOBILE_DESTINATIONS),
		overflow: all.slice(MOBILE_DESTINATIONS)
	};
}

/**
 * THE PLATFORM ROWS — everything that is not a module and not Home.
 *
 * The sidebar footer draws them under a rule; the phone puts them under More. Neither ever
 * gives them a slot, and neither invents them: this is the list, so "is Settings reachable
 * without the command bar?" is a question with one place to look and one answer.
 */
export type PlatformItem = {
	readonly label: string;
	readonly href: string;
	/**
	 * Full page load rather than client-side navigation. Export streams a zip from a
	 * `+server.ts`, and the router cannot navigate to a download.
	 */
	readonly reload?: boolean;
};

/** The switcher's route. Named because the sidebar hangs the running total on this row. */
export const MODULES_HREF = '/settings/modules';

export const PLATFORM_ITEMS: readonly PlatformItem[] = Object.freeze([
	{ label: 'Add a module', href: MODULES_HREF },
	{ label: 'Export your data', href: '/settings/export', reload: true },
	{ label: 'Settings', href: '/settings' }
]);

/**
 * Which row is lit, derived from the URL so it survives a reload, a bookmark and the back
 * button — none of which go through a click handler that could have set a flag.
 *
 * Home is exact-match only. Every other destination matches its own path and everything
 * under it, so `/invoicing/INV-2041` keeps Invoicing lit rather than lighting nothing.
 */
export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(`${href}/`);
}

/** The active item for a path, or null on a route that is not a nav destination. */
export function activeItem(access: AccessMap, pathname: string): NavItem | null {
	// Longest href first, so a future nested destination wins over its parent.
	const candidates = [...navItems(access)].sort((a, b) => b.href.length - a.href.length);
	return candidates.find((item) => isActive(pathname, item.href)) ?? null;
}
