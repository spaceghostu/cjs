/**
 * Runs `scripts/invariants.sql` and exits non-zero if the floor has a hole in it.
 *
 * A `.sql` file alone is not a check — it is a check somebody has to remember to run, and
 * `psql` exits 0 on a failed statement unless invoked with `-v ON_ERROR_STOP=1`, which is
 * exactly the kind of detail that makes a green CI meaningless. This wrapper has one job:
 * be impossible to pass by accident.
 *
 *   bun run db:verify
 *
 * It connects as the DDL role, because reading `pg_class.relowner` and
 * `has_table_privilege()` for another role requires seeing the whole catalogue. It asserts
 * things ABOUT the application role without connecting as it.
 *
 * Also exported as `verifyInvariants()` so the integration tests can prove the assertions
 * actually fire — a check nobody has watched fail is a check nobody knows works.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const SQL_PATH = path.resolve(import.meta.dirname, 'invariants.sql');

export type InvariantResult = { ok: true } | { ok: false; message: string };

/**
 * @param connectionString the DDL/owner connection. Not the application role.
 * @param appRole the role the assertions are made about.
 */
export async function verifyInvariants(
	connectionString: string,
	appRole = process.env.CJS_APP_ROLE || 'cjs_app'
): Promise<InvariantResult> {
	const sql = await readFile(SQL_PATH, 'utf8');
	const client = new pg.Client({ connectionString });
	await client.connect();
	try {
		// The SQL reads this rather than hardcoding a role name, so a deployment that names
		// its application role differently checks the right one.
		await client.query('select set_config($1, $2, false)', ['cjs.app_role', appRole]);
		await client.query(sql);
		return { ok: true };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	} finally {
		await client.end();
	}
}

/** `bun run scripts/invariants.ts` — the CI and post-migration entry point. */
async function main(): Promise<never> {
	const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
	if (!url) {
		console.error('Set DATABASE_MIGRATION_URL (preferred) or DATABASE_URL.');
		process.exit(2);
	}

	const result = await verifyInvariants(url);
	if (result.ok) {
		console.info('✓ Platform invariants hold.');
		process.exit(0);
	}

	console.error(`\n${result.message}\n`);
	process.exit(1);
}

// Only when executed directly — importing this from a test must not exit the process.
if (import.meta.main) await main();
