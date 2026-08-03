/**
 * ROWS -> DOMAIN.
 *
 * The second of the two doors money can come through. `parseMoneyInput` is the first (a
 * human typed it); this is the other (Postgres returned it). ESLint rule 5 restricts
 * importing `$lib/core/money/ctor` to the money module, this file, and tests — so there is
 * no third way, and a module author who computes `row.cents * 1.15` has nowhere to put the
 * answer.
 *
 * WHY THE CONVERSIONS ARE DEFENSIVE
 * ---------------------------------
 * `int8` is wider than a JavaScript number is exact. node-postgres therefore hands back
 * `bigint` columns as STRINGS by default, and Drizzle's `mode: 'number'` converts them —
 * but a hand-written `sql\`\`` query, a view, or a `count(*)` bypasses that and returns the
 * string. Rather than remember which is which at every call site, every constructor here
 * accepts `string | number | bigint` and refuses anything that is not an exact integer in
 * range. A value that has stopped being exactly representable is a wrong number on
 * somebody's invoice, and it is caught here, at the boundary, or not at all.
 *
 * Nothing in this file talks to the database. It maps values, so it is a pure unit under
 * test.
 */
import {
	MAX_CENTS,
	ZAR,
	type CurrencyCode,
	type Money,
	type Quantity,
	type Rate,
	type UnitPrice
} from '$lib/core/money';
import { money, quantity, rate, unitPrice } from '$lib/core/money/ctor';
import { toBrandColor, type BrandColor } from '$lib/components/theme/brand';
import type { business, customer, member, MemberRole } from './schema/core';

/** What a numeric column can arrive as, depending on how it was queried. */
export type NumericColumn = string | number | bigint;

/**
 * Narrow a column value to an exact integer.
 *
 * Throws rather than coercing. The alternative — silently returning 0, or NaN, or a rounded
 * approximation — turns a database or driver problem into an arithmetic one that surfaces
 * days later as a total nobody can explain.
 */
function exactInteger(value: NumericColumn, what: string): number {
	if (typeof value === 'bigint') {
		if (value > BigInt(MAX_CENTS) || value < -BigInt(MAX_CENTS)) {
			throw new RangeError(`${what} is outside the exactly-representable range: ${value}`);
		}
		return Number(value);
	}

	if (typeof value === 'string') {
		// Not `parseInt`: it happily reads "12abc" as 12 and "" as NaN. An int8 column that
		// contains anything other than an integer means something upstream is wrong.
		if (!/^-?\d+$/.test(value.trim())) {
			throw new RangeError(`${what} is not an integer column value: "${value}"`);
		}
		return exactInteger(BigInt(value), what);
	}

	if (!Number.isInteger(value)) {
		throw new RangeError(`${what} must be an integer, got ${value}`);
	}
	return value;
}

/** A currency column, narrowed. An unknown code is a corrupt row, not a default. */
export function toCurrency(value: unknown): CurrencyCode {
	if (value === ZAR) return ZAR;
	throw new RangeError(`unsupported currency in row: ${JSON.stringify(value)}`);
}

/** `int8` cents -> `Money`. */
export function toMoney(cents: NumericColumn, currency: unknown = ZAR): Money {
	return money(exactInteger(cents, 'money cents'), toCurrency(currency));
}

/** `int8` millionths of a rand -> `UnitPrice`. */
export function toUnitPrice(micros: NumericColumn, currency: unknown = ZAR): UnitPrice {
	return unitPrice(exactInteger(micros, 'unit price micros'), toCurrency(currency));
}

/** `int8` millionths of a unit -> `Quantity`. */
export function toQuantity(e6: NumericColumn): Quantity {
	return quantity(exactInteger(e6, 'quantity e6'));
}

/** `int8` parts per million -> `Rate`. */
export function toRate(ppm: NumericColumn): Rate {
	return rate(exactInteger(ppm, 'rate ppm'));
}

/**
 * Nullable columns. An outer join or an optional amount gives NULL, and NULL is not zero —
 * "no discount recorded" and "a discount of R0.00" are different facts.
 */
export function toMoneyOrNull(cents: NumericColumn | null, currency: unknown = ZAR): Money | null {
	return cents === null ? null : toMoney(cents, currency);
}

export function toQuantityOrNull(e6: NumericColumn | null): Quantity | null {
	return e6 === null ? null : toQuantity(e6);
}

// ── Domain -> column ────────────────────────────────────────────────────────────────
//
// The way back out. Deliberately trivial: the whole point of the object types is that the
// integer inside is already exact, so writing it is a field access and never arithmetic.

export function moneyToColumn(value: Money): number {
	return value.cents;
}

export function unitPriceToColumn(value: UnitPrice): number {
	return value.micros;
}

export function quantityToColumn(value: Quantity): number {
	return value.e6;
}

export function rateToColumn(value: Rate): number {
	return value.ppm;
}

// ── Rows -> domain records ──────────────────────────────────────────────────────────

/**
 * The tenant.
 *
 * `business_id` is the column name (see the note in `schema/core.ts` — it is the primary
 * key so that every RLS policy in the database is one expression). The domain calls it
 * `id`, because outside the database nobody needs to care.
 */
export type Business = {
	id: string;
	tradingName: string;
	legalName: string | null;
	registrationNumber: string | null;
	vatNumber: string | null;
	phone: string | null;
	email: string | null;
	address: PostalAddress;
	brandColor: BrandColor;
	currency: CurrencyCode;
	locale: string;
	aiEnabled: boolean;
};

export type PostalAddress = {
	line1: string | null;
	line2: string | null;
	city: string | null;
	postalCode: string | null;
	country: string;
};

export type Member = {
	id: string;
	businessId: string;
	userId: string;
	role: MemberRole;
};

export type Customer = {
	id: string;
	businessId: string;
	name: string;
	contactPerson: string | null;
	email: string | null;
	phone: string | null;
	vatNumber: string | null;
	address: PostalAddress;
	archivedAt: Date | null;
};

type BusinessRow = typeof business.$inferSelect;
type MemberRow = typeof member.$inferSelect;
type CustomerRow = typeof customer.$inferSelect;

function toAddress(row: {
	addressLine1: string | null;
	addressLine2: string | null;
	city: string | null;
	postalCode: string | null;
	country: string;
}): PostalAddress {
	return {
		line1: row.addressLine1,
		line2: row.addressLine2,
		city: row.city,
		postalCode: row.postalCode,
		country: row.country
	};
}

export function toBusiness(row: BusinessRow): Business {
	return {
		id: row.businessId,
		tradingName: row.tradingName,
		legalName: row.legalName,
		registrationNumber: row.registrationNumber,
		vatNumber: row.vatNumber,
		phone: row.phone,
		email: row.email,
		address: toAddress(row),
		// Narrows rather than throws: a brand colour that has drifted out of the palette is
		// a cosmetic problem, and blanking someone's dashboard over it would be worse than
		// showing them the default.
		brandColor: toBrandColor(row.brandColor),
		currency: toCurrency(row.currency),
		locale: row.locale,
		aiEnabled: row.aiEnabled
	};
}

export function toMember(row: MemberRow): Member {
	return {
		id: row.id,
		businessId: row.businessId,
		userId: row.userId,
		role: row.role
	};
}

export function toCustomer(row: CustomerRow): Customer {
	return {
		id: row.id,
		businessId: row.businessId,
		name: row.name,
		contactPerson: row.contactPerson,
		email: row.email,
		phone: row.phone,
		vatNumber: row.vatNumber,
		address: toAddress(row),
		archivedAt: row.archivedAt
	};
}
