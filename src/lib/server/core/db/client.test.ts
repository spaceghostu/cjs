/**
 * The driver contract.
 *
 * Everything in the tenancy floor rests on one mechanism: a transaction-scoped GUC set with
 * `set_config(..., is_local => true)`, read back by `app.biz()` inside an RLS policy. If
 * that does not work, there is no tenant isolation, no entitlement enforcement, no audit
 * actor attribution and no atomic document numbering.
 *
 * This is exactly what `drizzle-orm/neon-http` cannot do — it throws
 * "No transactions support in neon-http driver", being stateless per query — which is why
 * the driver was swapped before any data existed. These tests are the regression guard: if
 * someone ever swaps the driver back, they fail immediately and loudly rather than shipping
 * a product where every business can read every other business's invoices.
 *
 * Requires a database: `bun run db:dev`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { unsafeDb, closePool, assertDatabaseRoleIsSafe } from './client';

const BIZ_A = '11111111-1111-4111-8111-111111111111';
const BIZ_B = '22222222-2222-4222-8222-222222222222';

async function currentBiz(tx: { execute: typeof unsafeDb.execute }) {
	const { rows } = await tx.execute<{ biz: string | null }>(
		sql`select nullif(current_setting('app.business_id', true), '') as biz`
	);
	return rows[0].biz;
}

afterAll(async () => {
	await closePool();
});

describe('the database driver supports the tenancy mechanism', () => {
	it('runs real transactions', async () => {
		const out = await unsafeDb.transaction(async (tx) => {
			const { rows } = await tx.execute<{ n: number }>(sql`select 1::int as n`);
			return rows[0].n;
		});
		expect(out).toBe(1);
	});

	it('rolls back — which is what makes document numbering gapless', async () => {
		await expect(
			unsafeDb.transaction(async (tx) => {
				await tx.execute(sql`create temp table rollback_probe (id int)`);
				throw new Error('deliberate');
			})
		).rejects.toThrow('deliberate');

		const { rows } = await unsafeDb.execute<{ present: boolean }>(
			sql`select to_regclass('pg_temp.rollback_probe') is not null as present`
		);
		expect(rows[0].present).toBe(false);
	});

	it('sets a transaction-scoped GUC and reads it back', async () => {
		const seen = await unsafeDb.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.business_id', ${BIZ_A}, true)`);
			return currentBiz(tx);
		});
		expect(seen).toBe(BIZ_A);
	});

	it('DISCARDS the GUC at commit, so a pooled connection cannot carry one business into another', async () => {
		// The whole safety of `SET LOCAL` under connection pooling is that it is reverted at
		// COMMIT. If it leaked, business B's request could inherit business A's context from
		// a recycled backend — a cross-tenant data leak with no code path to blame.
		await unsafeDb.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.business_id', ${BIZ_A}, true)`);
			expect(await currentBiz(tx)).toBe(BIZ_A);
		});

		expect(await currentBiz(unsafeDb)).toBeNull();

		const inNext = await unsafeDb.transaction((tx) => currentBiz(tx));
		expect(inNext).toBeNull();
	});

	it('keeps concurrent transactions isolated from each other', async () => {
		// Two overlapping requests for different businesses must never see each other's GUC.
		const [a, b] = await Promise.all([
			unsafeDb.transaction(async (tx) => {
				await tx.execute(sql`select set_config('app.business_id', ${BIZ_A}, true)`);
				await tx.execute(sql`select pg_sleep(0.05)`);
				return currentBiz(tx);
			}),
			unsafeDb.transaction(async (tx) => {
				await tx.execute(sql`select set_config('app.business_id', ${BIZ_B}, true)`);
				await tx.execute(sql`select pg_sleep(0.05)`);
				return currentBiz(tx);
			})
		]);
		expect(a).toBe(BIZ_A);
		expect(b).toBe(BIZ_B);
	});

	it('reads an unset GUC as NULL rather than raising', async () => {
		// `app.biz()` depends on this: no GUC => NULL => the RLS predicate is NULL => zero
		// rows. A bug renders an empty page; it cannot render another business's data.
		expect(await currentBiz(unsafeDb)).toBeNull();
	});
});

describe('the application role cannot bypass the floor', () => {
	it('is neither SUPERUSER nor BYPASSRLS, and does not own the tables', async () => {
		// FORCE ROW LEVEL SECURITY does not apply to superusers, BYPASSRLS roles, or a
		// table's owner. If DATABASE_URL pointed at any of them, every policy in the system
		// would be decorative while everything appeared to work perfectly.
		await expect(assertDatabaseRoleIsSafe()).resolves.toBeUndefined();

		const { rows } = await unsafeDb.execute<{
			owns_identity_tables: number;
		}>(sql`
			select count(*)::int as owns_identity_tables
			  from pg_tables
			 where schemaname = 'identity' and tableowner = current_user
		`);
		expect(rows[0].owns_identity_tables).toBe(0);
	});
});
