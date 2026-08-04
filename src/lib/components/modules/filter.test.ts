/**
 * "Find a module".
 *
 * Small, and worth pinning: the interesting case is the one that would be missed by the
 * obvious implementation — somebody typing a word that appears only in a DESCRIPTION.
 */
import { describe, expect, it } from 'vitest';
import { countModules, filterGroups } from './filter';

const GROUPS = [
	{
		label: 'Sales',
		modules: [
			{ label: 'Quoting', description: 'Branded quotes clients can accept online' },
			{ label: 'Invoicing', description: 'Invoices, reminders and payment tracking' }
		]
	},
	{
		label: 'Operations',
		modules: [{ label: 'Inventory', description: 'Materials, stock counts and reorder points' }]
	}
];

describe('filterGroups', () => {
	it('returns the groups untouched for a blank query', () => {
		expect(filterGroups(GROUPS, '')).toBe(GROUPS);
		expect(filterGroups(GROUPS, '   ')).toBe(GROUPS);
	});

	it('narrows on the name', () => {
		expect(filterGroups(GROUPS, 'invo')).toEqual([
			{ label: 'Sales', modules: [GROUPS[0].modules[1]] }
		]);
	});

	it('narrows on the DESCRIPTION as well — the whole reason this is not a name match', () => {
		// Somebody looking for the thing that chases unpaid bills types "reminders", which
		// appears nowhere in the word "Invoicing".
		expect(filterGroups(GROUPS, 'reminders')).toEqual([
			{ label: 'Sales', modules: [GROUPS[0].modules[1]] }
		]);
	});

	it('is case-insensitive and ignores surrounding space', () => {
		expect(countModules(filterGroups(GROUPS, '  STOCK '))).toBe(1);
	});

	it('drops a group whose modules all fell out, rather than leaving an empty heading', () => {
		const result = filterGroups(GROUPS, 'quot');
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe('Sales');
	});

	it('returns nothing when nothing matches', () => {
		expect(filterGroups(GROUPS, 'payroll')).toEqual([]);
		expect(countModules([])).toBe(0);
	});
});
