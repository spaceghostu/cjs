/**
 * The database connection.
 *
 * WHY node-postgres and not neon-http
 * -----------------------------------
 * `drizzle-orm/neon-http` throws `"No transactions support in neon-http driver"`
 * (node_modules/drizzle-orm/neon-http/session.js). It is stateless per query: every
 * statement is an isolated HTTP round-trip, so `SET LOCAL` is impossible and plain `SET`
 * is discarded. That makes RLS session context structurally impossible — which means no
 * tenant isolation, no entitlement enforcement, no audit actor attribution, and no atomic
 * document-number allocation. neon-http exists to solve a problem (no sockets in edge
 * runtimes) that Coolify — a long-lived Node process — does not have.
 *
 * Postgres also has to live physically in South Africa: SARS GN 787 rule 4.1 requires
 * electronic tax records to be kept in the Republic, and rule 4.2's exemption needs a
 * per-taxpayer SARS authorisation that does not scale to self-service signup.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { env } from '$lib/server/env';
import * as schema from './schema';

/**
 * Pool sizing. The dashboard streams one short transaction per owned module, so the
 * floor is:
 *
 *   max >= (modules a business can own) x (expected concurrent dashboard loads) + headroom
 *
 * Keep this relationship in mind when the module count grows — the streamed dashboard is
 * deliberately bounded in `$lib/server/core/fanout.ts` so it can never demand more
 * connections than the pool has.
 */
const pool = new pg.Pool({
	connectionString: env.DATABASE_URL,
	max: env.DATABASE_POOL_MAX,
	idleTimeoutMillis: 30_000,
	// No request may hold a connection indefinitely.
	statement_timeout: 15_000,
	application_name: 'cjs'
});

pool.on('error', (err) => {
	// An idle client erroring must not take the process down.
	console.error('[db] idle client error', err);
});

/**
 * @internal The UNSCOPED connection. Import-banned everywhere outside this directory by
 * ESLint. Module code takes a `Ctx` from `withModule(event, key, intent)`; there is no
 * other route to the database, and `unsafeDb` is not assignable to the branded `Tx` that
 * scoped code requires.
 */
export const unsafeDb = drizzle(pool, { schema, casing: 'snake_case' });

export type Database = typeof unsafeDb;

let roleChecked: Promise<void> | null = null;

/**
 * Verify at boot that the application role cannot bypass the floor.
 *
 * `FORCE ROW LEVEL SECURITY` does not apply to superusers, to roles with BYPASSRLS, or to
 * the table owner. If `DATABASE_URL` points at any of those, every RLS policy in the
 * system becomes decorative and one misconfigured connection string silently turns off
 * tenant isolation for the whole product. That failure is invisible in testing (everything
 * works) and catastrophic in production (businesses see each other's invoices), so it is
 * checked explicitly rather than trusted.
 */
export function assertDatabaseRoleIsSafe(): Promise<void> {
	roleChecked ??= (async () => {
		// NOTE: unlike neon-http, node-postgres `execute()` returns a QueryResult — rows
		// are on `.rows`, not the result itself.
		const { rows } = await unsafeDb.execute<{
			role: string;
			is_super: boolean;
			bypasses_rls: boolean;
		}>(sql`
			select current_user as role,
			       rolsuper     as is_super,
			       rolbypassrls as bypasses_rls
			  from pg_roles
			 where rolname = current_user
		`);
		const row = rows[0];

		if (!row) throw new Error('[db] could not read the current role from pg_roles');

		const faults: string[] = [];
		if (row.is_super) faults.push('it is a SUPERUSER');
		if (row.bypasses_rls) faults.push('it has BYPASSRLS');

		if (faults.length) {
			throw new Error(
				`[db] DATABASE_URL connects as "${row.role}", and ${faults.join(' and ')}. ` +
					`Row Level Security does not apply to such roles, so tenant isolation would be ` +
					`silently disabled. Point DATABASE_URL at the unprivileged application role and ` +
					`use DATABASE_MIGRATION_URL for schema changes.`
			);
		}
	})();

	return roleChecked;
}

/** For graceful shutdown and for integration tests. */
export function closePool(): Promise<void> {
	return pool.end();
}
