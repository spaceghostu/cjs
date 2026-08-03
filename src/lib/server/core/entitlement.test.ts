/**
 * The three states, exhaustively.
 *
 * `accessFromPeriods` is pure so that the state that is easy to get wrong and expensive to
 * retrofit — REMOVED, where the data stays readable and exportable — can be pinned down
 * without a database, at exact period boundaries, before T10 supplies a single row.
 */
import { describe, expect, it } from 'vitest';
import {
	MODULE_KEYS,
	NO_ACCESS,
	accessFromPeriods,
	isModuleKey,
	label,
	permits,
	refuse,
	type SubscriptionPeriod
} from './entitlement';

const JAN = new Date('2026-01-01T00:00:00Z');
const JUN = new Date('2026-06-01T00:00:00Z');
const DEC = new Date('2026-12-01T00:00:00Z');

const period = (
	moduleKey: SubscriptionPeriod['moduleKey'],
	startedAt: Date,
	endedAt: Date | null = null
): SubscriptionPeriod => ({ moduleKey, startedAt, endedAt });

describe('accessFromPeriods', () => {
	it('locks every module when there are no periods at all', () => {
		expect(accessFromPeriods([], JUN)).toEqual(NO_ACCESS);
	});

	it('grants write while a period is open', () => {
		const access = accessFromPeriods([period('invoicing', JAN)], JUN);
		expect(access.invoicing).toBe('write');
	});

	it('leaves a REMOVED module readable — the design promises the data stays yours', () => {
		// The middle state. A boolean `owns` would collapse this into `none` and take a
		// business's own invoicing history away from it the moment they stopped paying.
		const access = accessFromPeriods([period('payroll', JAN, JUN)], DEC);
		expect(access.payroll).toBe('read');
	});

	it('locks a module that was never owned', () => {
		const access = accessFromPeriods([period('payroll', JAN, JUN)], DEC);
		expect(access.inventory).toBe('none');
	});

	it('treats re-adding as a new period and restores write', () => {
		const access = accessFromPeriods([period('payroll', JAN, JUN), period('payroll', DEC)], DEC);
		expect(access.payroll).toBe('write');
	});

	it('never lets an older closed period downgrade an active one', () => {
		// Order-independence matters: the query that feeds this is `order by started_at`, but
		// a future change to it must not silently turn an owned module read-only.
		const reversed = accessFromPeriods([period('payroll', DEC), period('payroll', JAN, JUN)], DEC);
		expect(reversed.payroll).toBe('write');
	});

	it('grants nothing for a period that has not started yet', () => {
		// Scheduling a module for next month must not unlock it today — not even the archive.
		const access = accessFromPeriods([period('bookings', DEC)], JUN);
		expect(access.bookings).toBe('none');
	});

	it('counts the first instant of a period as owned', () => {
		expect(accessFromPeriods([period('quoting', JUN)], JUN).quoting).toBe('write');
	});

	it('counts the closing instant as already removed', () => {
		// Half-open interval: `[startedAt, endedAt)`. The alternative double-counts the
		// boundary, and T12's proration would bill a day twice.
		expect(accessFromPeriods([period('quoting', JAN, JUN)], JUN).quoting).toBe('read');
	});

	it('returns a frozen map, so nothing downstream can widen its own access', () => {
		const access = accessFromPeriods([period('quoting', JAN)], JUN);
		expect(Object.isFrozen(access)).toBe(true);
	});

	it('covers every catalogue module', () => {
		const access = accessFromPeriods([], JUN);
		expect(Object.keys(access).sort()).toEqual([...MODULE_KEYS].sort());
	});
});

describe('permits', () => {
	it.each([
		['write', 'write', true],
		['write', 'read', true],
		['read', 'write', false],
		['read', 'read', true],
		['none', 'write', false],
		['none', 'read', false]
	] as const)('access %s + intent %s -> %s', (access, intent, expected) => {
		expect(permits(access, intent)).toBe(expected);
	});

	it('is what makes a removed module exportable', () => {
		// Export runs a read. If `read` did not succeed on a removed module, "your payroll
		// data stays yours" would be false the moment somebody tried to take it.
		expect(permits('read', 'read')).toBe(true);
	});
});

describe('refuse', () => {
	it('offers the locked module rather than reporting an error', () => {
		try {
			refuse('payroll', 'none');
			expect.unreachable('refuse must throw');
		} catch (thrown) {
			const failure = thrown as { status: number; body: App.Error };
			expect(failure.status).toBe(403);
			expect(failure.body.code).toBe('module_locked');
			expect(failure.body.message).toContain('Payroll');
			// A refusal without a next step is a dead end.
			expect(failure.body.nextHref).toBe('/settings/modules');
		}
	});

	it('tells a removed module’s owner their data is still theirs', () => {
		try {
			refuse('payroll', 'read');
			expect.unreachable('refuse must throw');
		} catch (thrown) {
			const failure = thrown as { status: number; body: App.Error };
			expect(failure.body.code).toBe('module_removed');
			expect(failure.body.message).toMatch(/stays yours to read and export/);
		}
	});

	it('never shows a machine key to a person', () => {
		for (const key of MODULE_KEYS) {
			expect(label(key)).not.toBe(key);
			expect(label(key)[0]).toBe(label(key)[0].toUpperCase());
		}
	});
});

describe('isModuleKey', () => {
	it('accepts the catalogue and refuses everything else', () => {
		expect(isModuleKey('invoicing')).toBe(true);
		expect(isModuleKey('accounting')).toBe(false);
		expect(isModuleKey(null)).toBe(false);
		expect(isModuleKey('__proto__')).toBe(false);
	});
});
