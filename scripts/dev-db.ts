/**
 * A local Postgres for development and integration tests.
 *
 * No Docker, no sudo — `embedded-postgres` unpacks a real Postgres server into
 * node_modules and runs it in userspace. Everything the floor depends on (row level
 * security, `SET LOCAL`, transactional counters, triggers) behaves exactly as it will in
 * production, which is the whole point: the tenant-isolation and numbering tests are
 * worthless against a fake.
 *
 * It creates the TWO roles the architecture requires and keeps them genuinely separate:
 *
 *   cjs_owner  owns the schema. Runs DDL. -> DATABASE_MIGRATION_URL
 *   cjs_app    owns nothing, NOSUPERUSER, NOBYPASSRLS. -> DATABASE_URL
 *
 * That separation is not ceremony. `FORCE ROW LEVEL SECURITY` does not apply to a table's
 * owner, to a superuser, or to a role with BYPASSRLS — so if the app connected as the
 * owner, every policy in the system would be decorative and tenant isolation would be off
 * while appearing to work perfectly.
 *
 *   bun run db:dev          start (and initialise on first run)
 *   bun run db:dev:stop     stop
 *   bun run db:dev:reset    delete the cluster and start clean
 */
import EmbeddedPostgres from 'embedded-postgres';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../.dev/pg');
const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const SUPER_USER = 'postgres';
const SUPER_PASSWORD = 'postgres';
const DB = 'cjs';

const OWNER = { user: 'cjs_owner', password: 'cjs_owner' };
const APP = { user: 'cjs_app', password: 'cjs_app' };

function url(who: { user: string; password: string }) {
	return `postgres://${who.user}:${who.password}@127.0.0.1:${PORT}/${DB}`;
}

function instance() {
	return new EmbeddedPostgres({
		databaseDir: DATA_DIR,
		user: SUPER_USER,
		password: SUPER_PASSWORD,
		port: PORT,
		persistent: true
	});
}

async function exists() {
	const { access } = await import('node:fs/promises');
	try {
		await access(path.join(DATA_DIR, 'PG_VERSION'));
		return true;
	} catch {
		return false;
	}
}

async function provisionRoles(pg: EmbeddedPostgres) {
	const client = pg.getPgClient(DB);
	await client.connect();
	try {
		// Roles are cluster-wide, so guard against re-running.
		for (const who of [OWNER, APP]) {
			await client.query(`
				do $$ begin
					if not exists (select 1 from pg_roles where rolname = '${who.user}') then
						create role ${who.user} login password '${who.password}'
							nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
					end if;
				end $$;
			`);
		}
		// The owner owns the schema; the app role may use it but never create in it.
		await client.query(`alter schema public owner to ${OWNER.user}`);
		await client.query(`grant usage on schema public to ${APP.user}`);
		await client.query(`revoke create on schema public from public, ${APP.user}`);
		await client.query(`alter database ${DB} owner to ${OWNER.user}`);
	} finally {
		await client.end();
	}
}

async function start() {
	const pg = instance();
	if (!(await exists())) {
		console.info('· initialising a new Postgres cluster at .dev/pg');
		await pg.initialise();
	}
	await pg.start();
	try {
		await pg.createDatabase(DB);
	} catch {
		// already there
	}
	await provisionRoles(pg);

	console.info(
		[
			'',
			`  Postgres is up on port ${PORT}.`,
			'',
			'  Put these in .env:',
			'',
			`    DATABASE_URL="${url(APP)}"`,
			`    DATABASE_MIGRATION_URL="${url(OWNER)}"`,
			'',
			'  Leave this process running. Ctrl-C stops the cluster (data is kept).',
			''
		].join('\n')
	);

	const shutdown = async () => {
		await pg.stop().catch(() => {});
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
	// Hold the process open.
	await new Promise(() => {});
}

async function stop() {
	await instance()
		.stop()
		.catch((e) => console.warn('· nothing to stop:', (e as Error).message));
}

async function reset() {
	await stop();
	await rm(DATA_DIR, { recursive: true, force: true });
	console.info('· cluster deleted');
	await start();
}

const cmd = process.argv[2] ?? 'start';
if (cmd === 'start') await start();
else if (cmd === 'stop') await stop();
else if (cmd === 'reset') await reset();
else {
	console.error(`unknown command "${cmd}" — use start | stop | reset`);
	process.exit(1);
}
