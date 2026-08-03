/**
 * The number in the sidebar footer is a number about someone's money, so it gets the same
 * treatment as everything else in that category: exact, integer, and tested at its edges.
 */
import { describe, expect, it } from 'vitest';
import { MODULES, NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
import { formatZar } from '$lib/core/money';
import { modulePrice, monthlyTotal, purchasableModules } from './catalogue';

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
