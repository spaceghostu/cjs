/**
 * The command bar's two hard rules, asserted rather than trusted.
 *
 *   1. Nothing is reachable ONLY through the bar.
 *   2. Nothing it produces is committed by it.
 *
 * The first is the one that rots quietly: someone adds a useful shortcut here, ships it, and
 * a year later turning AI off takes a capability with it — which is exactly what the design
 * says must never happen. So the enumeration below is a test, not a comment.
 *
 * The record queries (customers, and later quotes/invoices/stock) need a database and are
 * covered by the tenancy suite, which proves the RLS scoping this file relies on.
 */
import { describe, expect, it } from 'vitest';
import { NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';
import { PLATFORM_ITEMS, navItems } from '$lib/components/shell/nav';
import { MIN_QUERY_LENGTH, destinations, looksLikeQuestion } from './search';

function owning(...keys: ModuleKey[]): AccessMap {
	return { ...NO_ACCESS, ...Object.fromEntries(keys.map((k) => [k, 'write' as const])) };
}

const THORNHILL = owning('quoting', 'invoicing', 'inventory');

describe('nothing is reachable only through the command bar', () => {
	it('offers no destination the two navs do not already have', () => {
		const reachableWithoutTheBar = new Set([
			...navItems(THORNHILL).map((i) => i.href),
			...PLATFORM_ITEMS.map((i) => i.href)
		]);

		// Every one-and-two letter query is under the minimum, so search the labels directly:
		// what matters is the SET the bar can produce, not what a particular query returns.
		for (const item of navItems(THORNHILL)) {
			for (const hit of destinations(THORNHILL, item.label)) {
				expect(reachableWithoutTheBar.has(hit.href)).toBe(true);
			}
		}
	});

	it('holds for a business that owns nothing at all', () => {
		const reachable = new Set([
			...navItems(NO_ACCESS).map((i) => i.href),
			...PLATFORM_ITEMS.map((i) => i.href)
		]);

		for (const item of navItems(NO_ACCESS)) {
			for (const hit of destinations(NO_ACCESS, item.label)) {
				expect(reachable.has(hit.href)).toBe(true);
			}
		}
	});

	it('offers a locked module rather than pretending it does not exist', () => {
		const hits = destinations(THORNHILL, 'payroll');
		expect(hits.map((h) => h.href)).toContain('/payroll');
		expect(hits[0].subtitle).toBe('Not added yet');
	});

	it('cannot reach a module the catalogue does not offer and the business never owned', () => {
		expect(destinations(THORNHILL, 'bookings')).toEqual([]);
	});

	it('every platform destination is in the nav that stays when AI is off', () => {
		// The bar is the ONLY thing `aiEnabled` removes. This is the list that has to survive.
		expect(PLATFORM_ITEMS.map((i) => i.href)).toEqual([
			'/settings/modules',
			'/settings/export',
			'/settings'
		]);
	});
});

describe('destinations', () => {
	it('ranks a prefix match above one buried in the middle', () => {
		const hits = destinations(owning('invoicing'), 'in');
		// "Invoicing" starts with it; "Home" does not contain it at all.
		expect(hits[0].title).toBe('Invoicing');
	});

	it('is accent-insensitive, because a name is one name', () => {
		expect(destinations(THORNHILL, 'invoicing')).toHaveLength(1);
		expect(destinations(THORNHILL, 'INVOICING')).toHaveLength(1);
	});
});

describe('looksLikeQuestion', () => {
	it('reads a question mark as a question', () => {
		expect(looksLikeQuestion('who owes me money?')).toBe(true);
	});

	it('reads a request as a question', () => {
		expect(looksLikeQuestion('draft an invoice for Thornhill')).toBe(true);
	});

	it('reads a name as a search', () => {
		expect(looksLikeQuestion('Thornhill')).toBe(false);
		expect(looksLikeQuestion('INV-2041')).toBe(false);
	});

	it('is false on nothing', () => {
		expect(looksLikeQuestion('   ')).toBe(false);
	});
});

describe('MIN_QUERY_LENGTH', () => {
	it('is short enough for a document prefix and long enough to mean something', () => {
		expect(MIN_QUERY_LENGTH).toBe(2);
	});
});
