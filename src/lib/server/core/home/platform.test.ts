/**
 * What the platform puts on the dashboard: the bill, and when it next happens.
 */
import { describe, expect, it } from 'vitest';
import { modulesPanel, platformAgenda } from './platform';
import { monthlyTotal } from '../modules/catalogue';
import { NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';

function owning(...keys: readonly ModuleKey[]): AccessMap {
	return Object.freeze({
		...NO_ACCESS,
		...Object.fromEntries(keys.map((key) => [key, 'write' as const]))
	});
}

/** The design's tenant: Quoting, Invoicing and Inventory at R450 a month. */
const THORNHILL = owning('quoting', 'invoicing', 'inventory');

describe('modulesPanel', () => {
	it('lists what the business owns, in catalogue order', () => {
		expect(modulesPanel(THORNHILL).lines.map((l) => l.module)).toEqual([
			'quoting',
			'invoicing',
			'inventory'
		]);
	});

	it('shows the total the design states', () => {
		expect(modulesPanel(THORNHILL).total.cents).toBe(45_000);
	});

	it('reads the same sum as the sidebar and the switcher', () => {
		// Three sums of somebody's monthly bill would be three chances to disagree on screen.
		expect(modulesPanel(THORNHILL).total).toEqual(monthlyTotal(THORNHILL));
	});

	it('is empty and free for a business that owns nothing', () => {
		const panel = modulesPanel(NO_ACCESS);
		expect(panel.lines).toEqual([]);
		expect(panel.total.cents).toBe(0);
	});

	it('leaves out a removed module and its price', () => {
		const panel = modulesPanel(Object.freeze({ ...THORNHILL, inventory: 'read' as const }));
		expect(panel.lines.map((l) => l.module)).toEqual(['quoting', 'invoicing']);
		expect(panel.total.cents).toBe(27_000);
	});
});

describe('platformAgenda', () => {
	const NOW = new Date('2025-08-01T17:30:00Z');

	it('dates the renewal at the first of next month', () => {
		const [row] = platformAgenda(THORNHILL, NOW);
		expect(row.on.toISOString()).toBe('2025-08-31T22:00:00.000Z'); // 1 Sep, SAST midnight
	});

	it('states the amount and what it covers, and nothing else', () => {
		const [row] = platformAgenda(THORNHILL, NOW);

		expect(row.title).toBe('Your modules renew');
		expect(row.detail).toBe('R450 for the 3 modules you have now');
		// No countdown, no "action required" — see ESLint zone 10.
		expect(row.detail).not.toMatch(/day[s]? left|expires|hurry/i);
	});

	it('says module in the singular', () => {
		expect(platformAgenda(owning('quoting'), NOW)[0].detail).toBe(
			'R120 for the module you have now'
		);
	});

	it('contributes nothing when the business pays nothing', () => {
		// A renewal row for R0 is noise dressed as reassurance.
		expect(platformAgenda(NO_ACCESS, NOW)).toEqual([]);
	});
});
