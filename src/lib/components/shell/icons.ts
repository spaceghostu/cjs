/**
 * A glyph per destination.
 *
 * Separate from the catalogue because the catalogue is data — importable by a server route,
 * a test, or the export job — and an icon is a Svelte component. Keeping them apart means
 * `$lib/core/modules/catalogue` costs nothing to import from anywhere.
 *
 * Every key in the catalogue has an entry, including the modules nobody has built: the
 * locked state renders the icon, so a module with no glyph would show a hole on the exact
 * screen that is trying to sell it.
 */
import BadgeCheck from '@lucide/svelte/icons/badge-check';
import CalendarDays from '@lucide/svelte/icons/calendar-days';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import House from '@lucide/svelte/icons/house';
import Package from '@lucide/svelte/icons/package';
import Receipt from '@lucide/svelte/icons/receipt';
import Users from '@lucide/svelte/icons/users';
import Wallet from '@lucide/svelte/icons/wallet';
import type { Component } from 'svelte';
import type { NavKey } from './nav';

const ICONS: Readonly<Record<NavKey, Component>> = Object.freeze({
	home: House,
	quoting: ClipboardList,
	invoicing: Receipt,
	bookings: CalendarDays,
	inventory: Package,
	scheduling: BadgeCheck,
	payroll: Users,
	expenses: Wallet
}) as Record<NavKey, Component>;

export function navIcon(key: NavKey): Component {
	return ICONS[key];
}
