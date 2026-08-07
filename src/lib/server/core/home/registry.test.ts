/**
 * THE REGISTRY IS THE ARCHITECTURE.
 *
 * These tests are less about the two functions than about the property they encode: Home reads
 * a list, and what a business sees follows from what it owns. Break that and the dashboard
 * starts querying modules nobody paid for.
 */
import { describe, expect, it } from 'vitest';
import { CONTRIBUTORS, contributorsFor, feeding } from './registry';
import { HOME_PANELS } from '$lib/core/home';
import { MODULES, NO_ACCESS, type AccessMap, type ModuleKey } from '$lib/core/modules/catalogue';

function access(entries: Partial<Record<ModuleKey, 'read' | 'write'>>): AccessMap {
	return Object.freeze({ ...NO_ACCESS, ...entries });
}

describe('CONTRIBUTORS', () => {
	it('registers only real catalogue modules', () => {
		const keys = new Set(MODULES.map((m) => m.key));
		expect(CONTRIBUTORS.every((c) => keys.has(c.module))).toBe(true);
	});

	it('registers each module once', () => {
		expect(new Set(CONTRIBUTORS.map((c) => c.module)).size).toBe(CONTRIBUTORS.length);
	});

	it('declares only panels that exist', () => {
		const panels = new Set<string>(HOME_PANELS);
		expect(CONTRIBUTORS.every((c) => c.panels.every((p) => panels.has(p)))).toBe(true);
	});

	it('gives every contributor at least one panel to feed', () => {
		// A contributor feeding nothing is a transaction opened on every dashboard load for a
		// result nobody reads.
		expect(CONTRIBUTORS.every((c) => c.panels.length > 0)).toBe(true);
	});
});

describe('contributorsFor', () => {
	it('asks nobody when the business owns nothing', () => {
		expect(contributorsFor(NO_ACCESS)).toEqual([]);
	});

	it('asks only the modules the business owns', () => {
		const asked = contributorsFor(access({ quoting: 'write' }));
		expect(asked.map((c) => c.module)).toEqual(['quoting']);
	});

	it('does not ask a REMOVED module', () => {
		// `read` means removed: the data is still there and still exportable, but the module is
		// not part of the business, and reporting on it would quietly undo the removal.
		expect(contributorsFor(access({ invoicing: 'read' }))).toEqual([]);
	});

	it('returns them in catalogue order, so two businesses read the same order', () => {
		const asked = contributorsFor(access({ inventory: 'write', quoting: 'write' }));
		expect(asked.map((c) => c.module)).toEqual(['quoting', 'inventory']);
	});
});

describe('feeding', () => {
	it('selects the contributors a panel waits for, and no others', () => {
		const owned = contributorsFor(
			access({ quoting: 'write', invoicing: 'write', inventory: 'write' })
		);

		// Only Invoicing knows about money coming in, so the money cards must not wait on the
		// other two. This is what makes "one slow module cannot block the rest" possible.
		expect(feeding(owned, 'figures').map((c) => c.module)).toEqual(['invoicing']);
		expect(feeding(owned, 'standing')).toHaveLength(3);
	});
});
