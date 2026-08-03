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
	// Identity is better-auth's; app/audit are hand-written platform SQL. drizzle-kit must
	// not try to manage or drop anything in them.
	schemaFilter: ['public', 'identity'],
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
