/**
 * `map.ts` is one of the two doors money comes through, so its refusals matter as much as
 * its conversions. Every test below that expects a throw is describing a number that would
 * otherwise have become a wrong total on somebody's invoice.
 */
import { describe, expect, it } from 'vitest';
import { DECIMAL_SEPARATOR, MAX_CENTS, THOUSANDS_SEPARATOR, formatZar } from '$lib/core/money';
import { DEFAULT_BRAND } from '$lib/components/theme/brand';
import {
	moneyToColumn,
	quantityToColumn,
	rateToColumn,
	toBusiness,
	toCurrency,
	toCustomer,
	toMember,
	toMoney,
	toMoneyOrNull,
	toQuantity,
	toQuantityOrNull,
	toRate,
	toUnitPrice,
	unitPriceToColumn
} from './map';
import type { business, customer, member } from './schema/core';

// Built from the exported constants rather than typed literally: the thousands separator is
// a narrow no-break space, which is indistinguishable from a plain space in a diff and would
// make this test fail for a reason nobody could see.
const R1234_56 = `R1${THOUSANDS_SEPARATOR}234${DECIMAL_SEPARATOR}56`;

describe('numeric columns', () => {
	it('accepts the number Drizzle produces for an int8 column', () => {
		expect(formatZar(toMoney(123456))).toBe(R1234_56);
	});

	it('accepts the STRING node-postgres produces for a raw int8 query', () => {
		// The case that makes this file defensive. `sql` template queries, views and
		// aggregates all bypass Drizzle's mode conversion and hand back a string.
		expect(formatZar(toMoney('123456'))).toBe(R1234_56);
	});

	it('accepts a bigint', () => {
		expect(toMoney(123456n).cents).toBe(123456);
	});

	it('preserves the sign of a credit', () => {
		expect(toMoney('-45000').cents).toBe(-45000);
	});

	it('normalises negative zero', () => {
		// `Object.is(-0, 0)` is false and Postgres has no such value, so a Money could
		// compare unequal to itself across a round trip. There is exactly one zero.
		expect(Object.is(toMoney(-0).cents, 0)).toBe(true);
	});

	it.each([
		['a decimal that should never have reached an int8 column', 12.5],
		['a NaN', Number.NaN],
		['an infinity', Number.POSITIVE_INFINITY]
	])('refuses %s', (_label, value) => {
		expect(() => toMoney(value)).toThrow(RangeError);
	});

	it.each([
		['an empty string', ''],
		['a decimal string', '12.50'],
		['a string with trailing junk', '12abc'],
		['a hex string', '0x10']
	])('refuses %s', (_label, value) => {
		expect(() => toMoney(value)).toThrow(/not an integer column value/);
	});

	it('refuses a value that has stopped being exactly representable', () => {
		// int8 holds far more than 2^53. Beyond that a JavaScript number is an approximation,
		// and an approximate cent is a defect the brief calls unacceptable.
		expect(() => toMoney(String(BigInt(MAX_CENTS) + 1n))).toThrow(/exactly-representable/);
		expect(() => toMoney(-BigInt(MAX_CENTS) - 1n)).toThrow(/exactly-representable/);
	});

	it('accepts exactly the boundary', () => {
		expect(toMoney(MAX_CENTS).cents).toBe(MAX_CENTS);
	});

	it('converts unit prices, quantities and rates with the same care', () => {
		expect(toUnitPrice('33333333').micros).toBe(33_333_333);
		expect(toQuantity('2500000').e6).toBe(2_500_000);
		expect(toRate('150000').ppm).toBe(150_000);
		expect(() => toQuantity('2.5')).toThrow(RangeError);
	});

	it('round-trips back to a column value unchanged', () => {
		expect(moneyToColumn(toMoney('123456'))).toBe(123456);
		expect(unitPriceToColumn(toUnitPrice('33333333'))).toBe(33_333_333);
		expect(quantityToColumn(toQuantity('2500000'))).toBe(2_500_000);
		expect(rateToColumn(toRate('150000'))).toBe(150_000);
	});
});

describe('nullable columns', () => {
	it('keeps NULL distinct from zero', () => {
		// "No discount recorded" and "a discount of R0.00" are different facts, and an outer
		// join produces the first. Coercing it to the second loses information silently.
		expect(toMoneyOrNull(null)).toBeNull();
		expect(toMoneyOrNull(0)?.cents).toBe(0);
		expect(toQuantityOrNull(null)).toBeNull();
		expect(toQuantityOrNull(0)?.e6).toBe(0);
	});
});

describe('currency', () => {
	it('accepts the supported code', () => {
		expect(toCurrency('ZAR')).toBe('ZAR');
	});

	it('refuses an unknown code instead of defaulting', () => {
		// A row whose currency is not one we support is corrupt. Defaulting to ZAR would
		// render a foreign amount with a rand sign, which is worse than an error.
		expect(() => toCurrency('USD')).toThrow(/unsupported currency/);
		expect(() => toCurrency(null)).toThrow(/unsupported currency/);
	});
});

describe('row to domain', () => {
	const businessRow: typeof business.$inferSelect = {
		businessId: 'b1e7c9d0-0000-4000-8000-000000000001',
		tradingName: 'Thornhill Joinery',
		legalName: 'Thornhill Joinery (Pty) Ltd',
		registrationNumber: '2019/123456/07',
		vatNumber: '4123456789',
		phone: '021 555 0134',
		email: 'hello@thornhill.co.za',
		addressLine1: '14 Bree Street',
		addressLine2: null,
		city: 'Cape Town',
		postalCode: '8001',
		country: 'ZA',
		brandColor: DEFAULT_BRAND,
		currency: 'ZAR',
		locale: 'en-ZA',
		aiEnabled: false,
		createdAt: new Date('2026-01-05T08:00:00Z'),
		updatedAt: new Date('2026-01-05T08:00:00Z')
	};

	it('renames the tenant key to something the rest of the app can read', () => {
		// `business_id` is the column name so that every RLS policy is one expression. The
		// awkwardness stops at the database boundary.
		expect(toBusiness(businessRow).id).toBe(businessRow.businessId);
	});

	it('gathers the address the document header needs', () => {
		expect(toBusiness(businessRow).address).toEqual({
			line1: '14 Bree Street',
			line2: null,
			city: 'Cape Town',
			postalCode: '8001',
			country: 'ZA'
		});
	});

	it('narrows a drifted brand colour instead of blanking the screen', () => {
		// The CHECK constraint should make this unreachable. If it ever is reached, a
		// cosmetic fallback beats a 500 on the dashboard.
		const drifted = toBusiness({ ...businessRow, brandColor: '#BADBAD' });
		expect(drifted.brandColor).toBe(DEFAULT_BRAND);
	});

	it('maps a member', () => {
		const row: typeof member.$inferSelect = {
			id: 'm1e7c9d0-0000-4000-8000-000000000001',
			businessId: businessRow.businessId,
			userId: 'user-abc',
			role: 'owner',
			createdAt: new Date(),
			updatedAt: new Date()
		};
		expect(toMember(row)).toEqual({
			id: row.id,
			businessId: row.businessId,
			userId: 'user-abc',
			role: 'owner'
		});
	});

	it('maps a customer, keeping the archive flag visible', () => {
		const archivedAt = new Date('2026-03-01T00:00:00Z');
		const row: typeof customer.$inferSelect = {
			id: 'c1e7c9d0-0000-4000-8000-000000000001',
			businessId: businessRow.businessId,
			name: 'Coastal Property Group',
			contactPerson: 'Zanele Dube',
			email: 'zanele@coastal.co.za',
			phone: null,
			vatNumber: null,
			addressLine1: null,
			addressLine2: null,
			city: null,
			postalCode: null,
			country: 'ZA',
			archivedAt,
			createdAt: new Date(),
			updatedAt: new Date()
		};
		const mapped = toCustomer(row);
		expect(mapped.name).toBe('Coastal Property Group');
		expect(mapped.archivedAt).toBe(archivedAt);
	});
});
