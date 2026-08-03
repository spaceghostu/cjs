/**
 * THE TYPE TEST.
 *
 * The acceptance criterion for T05 is "module code cannot reach `unsafeDb` — proven by a
 * type test, not just ESLint", and the distinction matters. A lint rule is a rule about
 * IMPORTS: it stops you naming the module, and an `eslint-disable` comment or a dynamic
 * import walks straight past it. The brand is a rule about VALUES, and there is no comment
 * that makes a type check pass.
 *
 * `@ts-expect-error` is the assertion. If a future change ever made `unsafeDb` assignable to
 * `Tx`, TypeScript would report the directive as unused and `bun run check` would fail —
 * which is exactly the alarm we want, raised by the type checker itself rather than by a
 * test that has to remember to run.
 *
 * This file lives inside `db/` because it has to import the very handle it is proving is
 * unusable.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closePool, runScoped, unsafeDb } from './client';
import type { Tx } from './tx';

// Closed once for the module — `unsafeDb` holds a single pool.
afterAll(async () => {
	await closePool();
});

describe('the branded transaction handle', () => {
	it('does not accept the unscoped connection', () => {
		// @ts-expect-error unsafeDb is not a scoped transaction. This is the whole security
		// model: a handle you have not been given by runScoped() cannot be passed to code
		// that requires tenancy.
		const forbidden: Tx = unsafeDb;
		expect(forbidden).toBeDefined();
	});

	it('does not accept a raw Drizzle transaction either', async () => {
		// Opening a transaction is not enough — the brand marks a transaction on which the
		// RLS session variables have been SET. Without that, every policy evaluates NULL.
		await unsafeDb.transaction(async (raw) => {
			// @ts-expect-error a transaction with no tenant context is not a Tx.
			const forbidden: Tx = raw;
			expect(forbidden).toBeDefined();
		});
	});

	it('is what runScoped hands out', async () => {
		const businessId = '33333333-3333-4333-8333-333333333333';
		const seen = await runScoped(businessId, 'user-1', async (tx: Tx) => {
			// Assignable, because runScoped produced it. No cast anywhere.
			const { rows } = await tx.execute<{ biz: string | null }>(
				sql`select app.current_business_id()::text as biz`
			);
			return rows[0]?.biz;
		});
		expect(seen).toBe(businessId);
	});

	it('carries the acting user for audit attribution', async () => {
		const seen = await runScoped('33333333-3333-4333-8333-333333333333', 'user-42', (tx) =>
			tx
				.execute<{ who: string | null }>(sql`select app.current_user_id() as who`)
				.then((r) => r.rows[0]?.who)
		);
		expect(seen).toBe('user-42');
	});

	it('maps a missing user to NULL rather than an empty string', async () => {
		// Background work genuinely has no user. An audit row that says so is more honest
		// than one attributed to whoever happened to run the migration.
		const seen = await runScoped('33333333-3333-4333-8333-333333333333', null, (tx) =>
			tx
				.execute<{ who: string | null }>(sql`select app.current_user_id() as who`)
				.then((r) => r.rows[0]?.who)
		);
		expect(seen).toBeNull();
	});

	it('reverts the context at commit, on the same pooled connection', async () => {
		// The reason `set_config(..., true)` is used and not a plain SET. Proven here on the
		// real pool: after the transaction commits, the next one starts with no context.
		await runScoped('33333333-3333-4333-8333-333333333333', 'user-1', async () => {});

		const after = await unsafeDb.transaction((tx) =>
			tx
				.execute<{ biz: string | null }>(sql`select app.current_business_id()::text as biz`)
				.then((r) => r.rows[0]?.biz)
		);
		expect(after).toBeNull();
	});

	it('reverts the context at ROLLBACK too', async () => {
		await expect(
			runScoped('33333333-3333-4333-8333-333333333333', 'user-1', async () => {
				throw new Error('deliberate');
			})
		).rejects.toThrow('deliberate');

		const after = await unsafeDb.transaction((tx) =>
			tx
				.execute<{ biz: string | null }>(sql`select app.current_business_id()::text as biz`)
				.then((r) => r.rows[0]?.biz)
		);
		expect(after).toBeNull();
	});
});
