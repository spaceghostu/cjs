/**
 * The shell. One import for anything that has to render around a module's screens.
 *
 * The nav MODEL is exported alongside the components on purpose: the command bar's
 * destinations and the mobile overflow both derive from it, and a second list of places a
 * business can go is the thing this whole file exists to prevent.
 */
export { default as AppSidebar } from './AppSidebar.svelte';
export { default as AppTopBar } from './AppTopBar.svelte';
export { default as CommandBar } from './CommandBar.svelte';
export { default as MobileHeader } from './MobileHeader.svelte';
export { default as MobileNav } from './MobileNav.svelte';
export { default as PrimaryAction } from './PrimaryAction.svelte';

export {
	MOBILE_DESTINATIONS,
	MOBILE_SLOTS,
	MODULES_HREF,
	PLATFORM_ITEMS,
	activeItem,
	isActive,
	mobileNav,
	navItems,
	sidebarGroups,
	type MobileNav as MobileNavModel,
	type NavGroup,
	type NavItem,
	type NavKey,
	type PlatformItem
} from './nav';

export { accentText, accentTint } from './accent';
export { navIcon } from './icons';
export { initialsOf, tenantSubtitle } from './identity';
