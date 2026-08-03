/**
 * Column builders every tenant table is assembled from.
 *
 * Two jobs:
 *
 *  1. Make the tenancy invariant cheap to satisfy. `scripts/invariants.sql` refuses any
 *     table outside `identity`/`app`/`audit`/`drizzle` that lacks `business_id uuid not
 *     null`, so `businessId()` is the one-line way to be correct rather than the thing
 *     someone forgets.
 *
 *  2. Make float money unrepresentable. `real`, `doublePrecision`, `numeric`, `decimal`
 *     and `money` are import-banned in schema files (eslint rule 4), and the message
 *     points here. Money is integer cents in `int8`; a unit price is millionths of a rand;
 *     a quantity is millionths of a unit; a rate is parts per million. Every one of them
 *     is an exact integer, and `roundDiv` is the only place a division result is rounded.
 *
 * The CHECK helpers matter as much as the column types. `Money.cents` is a JS `number`,
 * exact only below 2^53, so a value that exceeds `MAX_CENTS` has stopped being money and
 * become a silently-wrong number. The database refuses to store one.
 */
import { sql, type SQL } from 'drizzle-orm';
import { bigint, check, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { MAX_CENTS } from '$lib/core/money';

/**
 * The tenant column. Every table in the platform carries it, including `core_business`
 * itself — there, it is also the primary key, so the RLS policy on every table in the
 * database is the identical expression and there is no special case to get wrong.
 *
 * Deliberately NOT a foreign key by default: `core_business.business_id` references
 * nothing, and each other table wires its own reference. See `core.ts`.
 */
export function businessId() {
	return uuid().notNull();
}

/** Surrogate key. `gen_random_uuid()` is in core Postgres since 13 — no extension. */
export function id() {
	return uuid().primaryKey().defaultRandom();
}

/**
 * `created_at` / `updated_at`, both timezone-aware.
 *
 * `updated_at` is maintained by the `app.touch_updated_at()` trigger rather than by
 * Drizzle's `$onUpdate`, so a hand-written `UPDATE` in a migration or a psql session
 * cannot leave a stale timestamp behind.
 */
export function timestamps() {
	return {
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	};
}

/** Money, in integer cents. R1 234.56 -> 123456. */
export function cents() {
	return bigint({ mode: 'number' });
}

/** A unit price, in millionths of a rand. R33.333333/unit -> 33333333. */
export function micros() {
	return bigint({ mode: 'number' });
}

/** A quantity, in millionths of a unit. 2.5 hours -> 2500000. */
export function qtyE6() {
	return bigint({ mode: 'number' });
}

/** A ratio, in parts per million. 15% -> 150000. */
export function ppm() {
	return bigint({ mode: 'number' });
}

/**
 * Refuse a value that has left the exactly-representable range.
 *
 * Applies to every `cents()`, `micros()`, `qtyE6()` and `ppm()` column. `int8` holds far
 * more than 2^53, so without this the database would happily accept a number that
 * JavaScript can no longer represent exactly — and the corruption would surface much later,
 * as a total that is off by a cent for no visible reason.
 */
export function exactRange(name: string, column: AnyPgColumn): ReturnType<typeof check> {
	return check(name, sql`abs(${column}) <= ${sql.raw(String(MAX_CENTS))}`);
}

/** A text column that must not be blank. Postgres has no "non-empty text" type. */
export function notBlank(name: string, column: AnyPgColumn): ReturnType<typeof check> {
	return check(name, sql`length(btrim(${column})) > 0`);
}

/** `column in ('a', 'b', ...)`, with the values inlined so drizzle-kit can diff them. */
export function oneOf(
	name: string,
	column: AnyPgColumn,
	values: readonly string[]
): ReturnType<typeof check> {
	const list = values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ');
	return check(name, sql`${column} in (${sql.raw(list)})` as SQL);
}
