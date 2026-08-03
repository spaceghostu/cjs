/**
 * A check nobody has watched fail is a check nobody knows works.
 *
 * `scripts/invariants.sql` passing against a correct schema proves very little on its own —
 * a file containing `SELECT 1` would do the same. What matters is that it FAILS, loudly and
 * specifically, on each of the four mistakes it exists to catch. So each test below breaks
 * the floor in one precise way, watches the assertion fire, and puts it back.
 *
 * These run as the DDL role and mutate the schema, so they undo their damage in `finally` —
 * a leaked test table would fail every subsequent run of `bun run db:verify`.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { env } from '$lib/server/env';
import { verifyInvariants } from '../../../../../scripts/invariants';

const OWNER_URL = env.DATABASE_MIGRATION_URL || env.DATABASE_URL;

const owner = new pg.Client({ connectionString: OWNER_URL });
const connected = owner.connect();

afterAll(async () => {
	await connected;
	await owner.end();
});

/** Runs `sql`, keeps the invariant result, and always runs `undo`. */
async function whileBroken(setup: string[], undo: string[]): Promise<string> {
	await connected;
	for (const statement of setup) await owner.query(statement);
	try {
		const result = await verifyInvariants(OWNER_URL);
		if (result.ok) return '';
		return result.message;
	} finally {
		for (const statement of undo) await owner.query(statement);
	}
}

describe('scripts/invariants.sql', () => {
	it('passes against the schema as migrated', async () => {
		const result = await verifyInvariants(OWNER_URL);
		expect(result.ok ? '' : result.message).toBe('');
	});

	it('fails when a table has no business_id', async () => {
		// The mistake it exists to catch: a "global lookup table" someone believed needed no
		// tenant column, which then silently pools every business's data into one list.
		const message = await whileBroken(
			['create table invariant_probe_a (id uuid primary key, label text)'],
			['drop table invariant_probe_a']
		);
		expect(message).toMatch(/invariant_probe_a has no "business_id uuid NOT NULL"/);
	});

	it('fails when business_id is nullable', async () => {
		// Nullable is not good enough. A NULL tenant column matches no policy, so the row is
		// invisible to everyone — including the business that is supposed to own it.
		const message = await whileBroken(
			[
				'create table invariant_probe_b (id uuid primary key, business_id uuid)',
				'alter table invariant_probe_b enable row level security',
				'alter table invariant_probe_b force row level security'
			],
			['drop table invariant_probe_b']
		);
		expect(message).toMatch(/invariant_probe_b has no "business_id uuid NOT NULL"/);
	});

	it('fails when row level security is enabled but not forced', async () => {
		// The subtlest of the four. ENABLE alone leaves the table's OWNER exempt, so the
		// policy silently does nothing for exactly the connection most likely to be
		// misconfigured.
		const message = await whileBroken(
			[
				'create table invariant_probe_c (id uuid primary key, business_id uuid not null)',
				'alter table invariant_probe_c enable row level security'
			],
			['drop table invariant_probe_c']
		);
		expect(message).toMatch(/invariant_probe_c: row level security is enabled and NOT FORCED/);
	});

	it('fails when the application role is granted DELETE', async () => {
		const message = await whileBroken(
			[
				'create table invariant_probe_d (id uuid primary key, business_id uuid not null)',
				'alter table invariant_probe_d enable row level security',
				'alter table invariant_probe_d force row level security',
				'grant delete on invariant_probe_d to cjs_app'
			],
			['drop table invariant_probe_d']
		);
		expect(message).toMatch(/invariant_probe_d: role "cjs_app" holds DELETE/);
	});

	it('fails when the application role is granted TRUNCATE', async () => {
		// TRUNCATE destroys just as thoroughly as DELETE and is a separate privilege, so
		// revoking one without the other leaves the promise half-kept.
		const message = await whileBroken(
			[
				'create table invariant_probe_e (id uuid primary key, business_id uuid not null)',
				'alter table invariant_probe_e enable row level security',
				'alter table invariant_probe_e force row level security',
				'grant truncate on invariant_probe_e to cjs_app'
			],
			['drop table invariant_probe_e']
		);
		expect(message).toMatch(/invariant_probe_e: role "cjs_app" holds TRUNCATE/);
	});

	it('fails when the application role can create tables', async () => {
		// Because a role that can CREATE can define a table with no business_id and no
		// policies, which would defeat every assertion above it.
		const message = await whileBroken(
			['grant create on schema public to cjs_app'],
			['revoke create on schema public from cjs_app']
		);
		expect(message).toMatch(/role "cjs_app" holds CREATE on schema public/);
	});

	it('names every fault at once rather than stopping at the first', async () => {
		// A check that reports one problem per run turns a five-minute fix into five runs.
		const message = await whileBroken(
			['create table invariant_probe_f (id uuid primary key)'],
			['drop table invariant_probe_f']
		);
		expect(message).toMatch(/PLATFORM INVARIANTS VIOLATED \(2\)/);
		expect(message).toMatch(/has no "business_id uuid NOT NULL"/);
		expect(message).toMatch(/row level security is NOT ENABLED and NOT FORCED/);
	});

	it('reports a role that does not exist rather than passing vacuously', async () => {
		// The worst possible failure mode: a typo in the role name making every
		// `has_table_privilege` check return false, and the whole file report success.
		const result = await verifyInvariants(OWNER_URL, 'no_such_role');
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.message).toMatch(
			/the application role "no_such_role" does not exist/
		);
	});
});
