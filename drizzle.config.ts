import { defineConfig } from 'drizzle-kit';

/**
 * DDL runs as a DIFFERENT role from the application.
 *
 * `DATABASE_URL` is the unprivileged app role, which must not own the tables (FORCE ROW
 * LEVEL SECURITY does not apply to a table's owner) and must not be able to alter the
 * policies that constrain it. `DATABASE_MIGRATION_URL` is the owner/DDL role.
 *
 * In local development they may be the same connection; in production they must not be.
 */
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_MIGRATION_URL (preferred) or DATABASE_URL');

export default defineConfig({
	schema: './src/lib/server/core/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url },
	casing: 'snake_case',
	// `app` holds only functions and triggers, which drizzle-kit has no concept of and would
	// therefore report as drift forever. It is hand-written platform SQL and off-limits.
	// `audit` holds an ordinary table, so drizzle-kit generates it — what makes it an audit
	// log (the trigger, the RLS policy, the withheld UPDATE/DELETE grants) is hand-written
	// alongside, because none of that has a Drizzle representation either.
	schemaFilter: ['public', 'identity', 'audit'],
	verbose: true,
	strict: true
});

/**
 * NOTE: `drizzle-kit push` is deliberately NOT exposed as a script. It reconciles tables
 * only and will happily drop the RLS policies, triggers and grants that ARE the security
 * model, because it does not know about them. Always: db:generate -> db:migrate.
 *
 * Hand-written platform SQL (0001_platform.sql and the generated per-module files) must be
 * created with `drizzle-kit generate --custom` so it is registered in
 * drizzle/meta/_journal.json. An unjournaled .sql file in drizzle/ is an inert file that
 * never runs.
 */
