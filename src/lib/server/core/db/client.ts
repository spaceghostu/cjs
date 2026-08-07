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
import type { Tx } from './tx';

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

/**
 * THE ONLY PLACE A `Tx` IS MINTED.
 *
 * Opens a transaction, establishes the tenant context on that connection, and hands the
 * caller a branded handle. Everything downstream — every policy, every audit row — depends
 * on the two statements at the top of this function having run.
 *
 * WHY `set_config(..., true)` AND NOT `SET`
 * -----------------------------------------
 * The third argument is `is_local`, which makes this exactly `SET LOCAL`: the value is
 * reverted when the transaction ends. A plain `SET` would persist on the pooled connection
 * after it is returned, and the NEXT request to borrow that connection would inherit the
 * previous request's business id — a cross-tenant data leak with no bug at the call site
 * and nothing in the logs. `client.test.ts` proves the reversion on a single-connection
 * pool, which is the only way to observe it deterministically.
 *
 * `SET LOCAL` itself cannot be parameterised (it takes an identifier, not an expression),
 * so the value would have to be interpolated into SQL text. `set_config` is a function
 * call, takes bound parameters, and is therefore not something a hostile business id can
 * escape out of.
 *
 * @internal Not for module code. `withModule`/`withBusiness` in `../ctx.ts` are the
 * supported doors, and they apply the entitlement gate that this function deliberately
 * knows nothing about.
 */
export function runScoped<T>(
	businessId: string,
	userId: string | null,
	fn: (tx: Tx) => Promise<T>
): Promise<T> {
	return unsafeDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('cjs.business_id', ${businessId}, true)`);
		// Empty string, not NULL: `set_config` rejects NULL, and `app.current_user_id()`
		// maps '' back to NULL. Background work genuinely has no user, and an audit row
		// that says so is more honest than one attributed to whoever ran the migration.
		await tx.execute(sql`select set_config('cjs.user_id', ${userId ?? ''}, true)`);
		return fn(tx as Tx);
	});
}

/**
 * The one query that runs before a tenant is known: "which businesses is this person in?".
 *
 * Sign-in has a chicken-and-egg problem — the business id that drives every policy is
 * itself stored in a tenant table. The usual escape is a `SECURITY DEFINER` function that
 * reads membership with the owner's rights, which puts a deliberate hole in the floor and
 * makes "there is no way around RLS" false.
 *
 * Instead this sets `cjs.user_id` and nothing else. Two SELECT-only policies —
 * `member_sees_own_membership` and `member_sees_own_business` in `0003_platform.sql` — let
 * a person see their own membership rows and the businesses those rows point at. Every
 * other table still evaluates `business_id = NULL` and returns nothing, so the reach of
 * this function is exactly two tables and exactly the rows that are already theirs.
 *
 * @internal Used by `hooks.server.ts` to resolve the acting business, and by nothing else.
 */
export function runAsUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return unsafeDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('cjs.user_id', ${userId}, true)`);
		return fn(tx as Tx);
	});
}

/**
 * THE ONE QUERY A PERSON WHO IS NOT A USER CAN CAUSE.
 *
 * A client opens `/q/<token>` and reads a quote. They have no account, no session and no
 * membership, so `runScoped` has no business id to give and `runAsUser` has no user.
 *
 * The tempting shortcuts are both holes in the floor: look the token up on an unscoped
 * connection, or resolve the tenant and then open a normal scoped transaction. Either one
 * gives an unauthenticated request the reach of a whole business, with only the code's good
 * behaviour between it and every other document.
 *
 * So this closes the loop inside the model, the same way `member_sees_own_membership` does for
 * sign-in. It sets `cjs.share_token` and NOTHING ELSE — no business id, no user. The
 * `document_share` policies in `0006_quote_sharing.sql` then admit exactly four things: the one
 * quote whose token hash matches, its lines, its customer and its business. Every other table,
 * and every other row of those four, still evaluates `business_id = NULL` and returns nothing.
 *
 * The reach of this function is therefore a property of the DATABASE rather than of the route
 * that calls it. `quote-sharing.test.ts` attempts the traversal and gets zero rows.
 *
 * SELECT ONLY. Accepting or declining is a write, and writes still go through
 * `tenant_isolation` — see `modules/quoting/accept.ts`, which resolves the tenant here and
 * then performs the one bounded update as that tenant.
 *
 * @internal Used by the public quote page and by nothing else.
 */
export function runWithShareToken<T>(tokenHash: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return unsafeDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('cjs.share_token', ${tokenHash}, true)`);
		return fn(tx as Tx);
	});
}

/** For graceful shutdown and for integration tests. */
export function closePool(): Promise<void> {
	return pool.end();
}
