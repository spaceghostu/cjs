/**
 * The number in the sidebar footer is a number about someone's money, so it gets the same
 * treatment as everything else in that category: exact, integer, and tested at its edges.
 */
import { describe, expect, it } from 'vitest';
import { MODULES, NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
import { formatZar } from '$lib/core/money';
import {
	catalogueGroups,
	modulePrice,
	monthlyTotal,
	ownedCount,
	purchasableModules,
	totalWith
} from './catalogue';

function owning(...keys: ModuleKey[]): AccessMap {
	return { ...NO_ACCESS, ...Object.fromEntries(keys.map((k) => [k, 'write' as const])) };
}

describe('monthlyTotal', () => {
	it('is the design’s R450 for Quoting, Invoicing and Inventory', () => {
		const total = monthlyTotal(owning('quoting', 'invoicing', 'inventory'));
		expect(total.cents).toBe(45_000);
		expect(formatZar(total, { decimals: 0 })).toBe('R450');
	});

	it('is zero when nothing is owned, not an error and not a blank', () => {
		expect(monthlyTotal(NO_ACCESS).cents).toBe(0);
	});

	it('does not charge for a removed module', () => {
		const access: AccessMap = { ...owning('quoting'), invoicing: 'read' };
		expect(monthlyTotal(access).cents).toBe(12_000);
	});

	it('ignores a module that has no price', () => {
		expect(monthlyTotal(owning('expenses')).cents).toBe(0);
	});
});

describe('modulePrice', () => {
	it('quotes the design’s prices', () => {
		expect(modulePrice('quoting')?.cents).toBe(12_000);
		expect(modulePrice('invoicing')?.cents).toBe(15_000);
		expect(modulePrice('bookings')?.cents).toBe(9_000);
		expect(modulePrice('inventory')?.cents).toBe(18_000);
		expect(modulePrice('scheduling')?.cents).toBe(11_000);
		expect(modulePrice('payroll')?.cents).toBe(12_000);
	});

	it('is null for a module with no catalogue row in the design', () => {
		expect(modulePrice('expenses')).toBeNull();
	});

	it('gives every price a currency, so a total can never mix two', () => {
		for (const m of MODULES) {
			const price = modulePrice(m.key);
			if (price) expect(price.currency).toBe('ZAR');
		}
	});
});

describe('purchasableModules', () => {
	it('offers everything with a price, in catalogue order', () => {
		expect(purchasableModules().map((m) => m.key)).toEqual([
			'quoting',
			'invoicing',
			'bookings',
			'inventory',
			'scheduling',
			'payroll'
		]);
	});
});

const THORNHILL = owning('quoting', 'invoicing', 'inventory');

describe('ownedCount', () => {
	it('counts what the switcher says out loud — "You have 3"', () => {
		expect(ownedCount(THORNHILL)).toBe(3);
	});

	it('does not count a removed module as owned', () => {
		expect(ownedCount({ ...THORNHILL, inventory: 'read' })).toBe(2);
	});
});

describe('totalWith — the figure the confirmation shows', () => {
	it('quotes R570 for adding Payroll to the design’s tenant', () => {
		// The design shows the NEW TOTAL, never "+R120". This is that number, computed by the
		// same function that produces the current one rather than by adding a price to it.
		expect(totalWith(THORNHILL, 'payroll', 'write').cents).toBe(57_000);
	});

	it('quotes the lower total for a removal', () => {
		expect(totalWith(THORNHILL, 'invoicing', 'read').cents).toBe(30_000);
	});

	it('leaves the access map it was given alone', () => {
		totalWith(THORNHILL, 'payroll', 'write');
		expect(THORNHILL.payroll).toBe('none');
	});
});

describe('catalogueGroups', () => {
	it('is in the design’s stored order, never alphabetical', () => {
		expect(catalogueGroups(NO_ACCESS).map((g) => g.label)).toEqual([
			'Sales',
			'Operations',
			'People'
		]);
	});

	it('carries each row’s access, so the switcher branches on data and not on a name', () => {
		const [sales] = catalogueGroups(THORNHILL);
		expect(sales.modules.map((m) => [m.key, m.access])).toEqual([
			['quoting', 'write'],
			['invoicing', 'write'],
			['bookings', 'none']
		]);
	});

	it('omits a module that cannot be bought rather than pricing it at zero', () => {
		const keys = catalogueGroups(NO_ACCESS).flatMap((g) => g.modules.map((m) => m.key));
		expect(keys).not.toContain('expenses');
		// Every remaining row has a real price, which is what lets a row render one.
		expect(keys.every((key) => modulePrice(key) !== null)).toBe(true);
	});
});
