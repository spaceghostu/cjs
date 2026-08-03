/**
 * AUDIT — the append-only row change log.
 *
 * Exempt from the `business_id` invariant *by name* in `scripts/invariants.sql` (alongside
 * `identity`, `app` and `drizzle`), because it is not a tenant domain: it is the record of
 * what happened to one. It carries `business_id` anyway, and enforces Row Level Security on
 * it, so a tenant can be shown its own history without being shown anyone else's.
 *
 * APPEND-ONLY IS A GRANT, NOT A CONVENTION
 * ----------------------------------------
 * The application role holds `INSERT` and `SELECT` here and nothing else — no `UPDATE`, no
 * `DELETE` (see `drizzle/0003_platform.sql`). A log that the application can rewrite is not
 * evidence of anything.
 *
 * WHAT DRIZZLE OWNS HERE, AND WHAT IT DOES NOT
 * ---------------------------------------------
 * The table is an ordinary table, so drizzle-kit generates it like any other. What makes it
 * an audit log — the trigger that writes the rows, the RLS policy, and the grants that
 * withhold `UPDATE` and `DELETE` — has no Drizzle representation at all and is hand-written
 * in `drizzle/0003_platform.sql`. `audit.test.ts` drives a real change through both halves,
 * which is what keeps them in step.
 */
import { bigint, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditSchema = pgSchema('audit');

export const rowChange = auditSchema.table('row_change', {
	/** `generated always` — the application cannot choose, reuse or reorder an entry's id. */
	id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
	at: timestamp({ withTimezone: true }).notNull().defaultNow(),

	/** Whose data changed. Drives the RLS policy on this table. */
	businessId: uuid().notNull(),
	/**
	 * Who changed it. Null for background work, which runs without a user — that is a
	 * meaningful value, not a missing one, so it is recorded rather than faked.
	 */
	actorUserId: text(),

	/** `core_customer`, `quoting_quote`, … Schema-qualified is unnecessary: all in `public`. */
	tableName: text().notNull(),
	/** `INSERT` | `UPDATE` | `DELETE`. `DELETE` should never appear; if it does, that is the point. */
	op: text().notNull(),
	/** The changed row's primary key, rendered as text. Composite keys arrive as `a/b`. */
	rowId: text(),

	/** The row before and after, as the trigger saw it. Null on the side that did not exist. */
	before: jsonb().$type<Record<string, unknown> | null>(),
	after: jsonb().$type<Record<string, unknown> | null>()
});

export type RowChange = typeof rowChange.$inferSelect;
