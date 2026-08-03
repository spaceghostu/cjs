/**
 * The nav is generated, so what is tested is the GENERATION — not a snapshot of the four
 * rows the design happens to draw.
 *
 * The load-bearing claim is "the catalogue can grow without reshaping the shell". A test
 * that asserted the design's exact list would pass while that claim quietly stopped being
 * true, so the assertions here are about the rules: what makes a row appear, what makes a
 * group appear, and what overflows on a phone.
 */
import { describe, expect, it } from 'vitest';
import { MODULES, NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
import {
	MOBILE_DESTINATIONS,
	MOBILE_SLOTS,
	activeItem,
	isActive,
	mobileNav,
	navItems,
	sidebarGroups
} from './nav';

/** The design's tenant: Quoting, Invoicing and Inventory owned, everything else locked. */
function owning(...keys: ModuleKey[]): AccessMap {
	return { ...NO_ACCESS, ...Object.fromEntries(keys.map((k) => [k, 'write' as const])) };
}

const THORNHILL = owning('quoting', 'invoicing', 'inventory');

describe('sidebarGroups', () => {
	it('reproduces the design: Home, Sales, Operations, People', () => {
		const groups = sidebarGroups(THORNHILL);

		expect(groups.map((g) => g.label)).toEqual([null, 'Sales', 'Operations', 'People']);
		expect(groups.map((g) => g.items.map((i) => i.label))).toEqual([
			['Home'],
			['Quoting', 'Invoicing'],
			['Inventory'],
			['Payroll']
		]);
	});

	it('lights Payroll as a locked row with no ownership behind it', () => {
		const payroll = navItems(THORNHILL).find((i) => i.key === 'payroll');
		expect(payroll?.access).toBe('none');
	});

	it('keeps a removed module reachable — the archive is the point of the middle state', () => {
		const access: AccessMap = { ...THORNHILL, payroll: 'read' };
		const payroll = navItems(access).find((i) => i.key === 'payroll');
		expect(payroll?.access).toBe('read');
	});

	it('shows a never-owned module only when the catalogue offers it', () => {
		const keys = navItems(NO_ACCESS).map((i) => i.key);

		// Payroll is the design's standing offer, and the only one.
		expect(keys).toContain('payroll');
		expect(keys).not.toContain('quoting');
		expect(keys).not.toContain('bookings');
		expect(keys).not.toContain('scheduling');
	});

	it('shows a group the moment a business owns anything in it', () => {
		const before = sidebarGroups(NO_ACCESS).map((g) => g.label);
		const after = sidebarGroups(owning('inventory')).map((g) => g.label);

		// "A business owning no Operations module shows no Operations group."
		expect(before).not.toContain('Operations');
		expect(after).toContain('Operations');
	});

	it('omits a category with nothing in it rather than heading an empty list', () => {
		for (const group of sidebarGroups(NO_ACCESS)) {
			expect(group.items.length).toBeGreaterThan(0);
		}
	});

	it('never renders a module the catalogue has no row for', () => {
		const known = new Set<string>([...MODULES.map((m) => m.key), 'home']);
		for (const item of navItems(THORNHILL)) expect(known.has(item.key)).toBe(true);
	});

	it('puts Home first, always, and never locks it', () => {
		for (const access of [NO_ACCESS, THORNHILL, owning(...MODULES.map((m) => m.key))]) {
			const [first] = navItems(access);
			expect(first.key).toBe('home');
			expect(first.access).toBe('write');
		}
	});
});

describe('mobileNav', () => {
	it('is the design’s Home, Quotes, Invoices, Stock — and More', () => {
		const { items, overflow } = mobileNav(THORNHILL);

		expect(items.map((i) => i.shortLabel)).toEqual(['Home', 'Quotes', 'Invoices', 'Stock']);
		// The fifth slot is the overflow, and Payroll is what is under it.
		expect(overflow.map((i) => i.key)).toEqual(['payroll']);
	});

	it('renders no More when everything fits', () => {
		const { items, overflow } = mobileNav(owning('quoting', 'invoicing'));

		expect(items.map((i) => i.shortLabel)).toEqual(['Home', 'Quotes', 'Invoices', 'Payroll']);
		expect(overflow).toEqual([]);
	});

	it('keeps the first four and moves the rest under More', () => {
		const everything = owning(...MODULES.map((m) => m.key));
		const { items, overflow } = mobileNav(everything);

		expect(items).toHaveLength(MOBILE_DESTINATIONS);
		expect(overflow.length).toBeGreaterThan(0);
		// Four destinations plus More is five: the row never grows past what a thumb can hit.
		expect(items.length + 1).toBe(MOBILE_SLOTS);
	});

	it('loses no destination to the overflow', () => {
		const everything = owning(...MODULES.map((m) => m.key));
		const { items, overflow } = mobileNav(everything);

		expect([...items, ...overflow].map((i) => i.key)).toEqual(
			navItems(everything).map((i) => i.key)
		);
	});
});

describe('isActive', () => {
	it('matches Home exactly and nothing else', () => {
		expect(isActive('/', '/')).toBe(true);
		expect(isActive('/invoicing', '/')).toBe(false);
	});

	it('keeps a module lit on its own detail routes', () => {
		expect(isActive('/invoicing/INV-2041', '/invoicing')).toBe(true);
	});

	it('does not match a sibling that merely shares a prefix', () => {
		expect(isActive('/invoicing-archive', '/invoicing')).toBe(false);
	});
});

describe('activeItem', () => {
	it('resolves the row the URL is under', () => {
		expect(activeItem(THORNHILL, '/inventory/count/12')?.key).toBe('inventory');
	});

	it('returns null on a route that is not a destination', () => {
		expect(activeItem(THORNHILL, '/settings')).toBeNull();
	});
});
