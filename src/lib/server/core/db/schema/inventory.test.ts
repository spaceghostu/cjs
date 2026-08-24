/**
 * THE GUARANTEES `invariants.sql` CANNOT REACH.
 *
 * Every assertion in `scripts/invariants.sql` filters on `relkind IN ('r','p')` — ordinary and
 * partitioned tables. `inventory_level` is a VIEW, so none of them examines it: not the
 * `business_id NOT NULL` check, not RLS-enabled-and-forced, not the no-DELETE grant. That is the
 * correct classification — a view has no rows of its own to be a tenant of — but it means the
 * usual safety net has a hole exactly where this module's most important relation sits.
 *
 * This file is the net instead. It proves, against a real Postgres:
 *
 *   1. The level view cannot be written, and its tenancy holds through `security_invoker`.
 *   2. A movement is append-only once recorded.
 *   3. A count's expected quantities are a snapshot, and an applied count is terminal.
 *
 * Requires a database: `bun run db:dev`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { closePool, runScoped } from '../client';
import { cleanupFixtures, createBusiness, createUser, messageFromRejection } from '../fixtures';

/** Millionths of a unit. */
const units = (n: number) => n * 1_000_000;

type Seeded = { businessId: string; userId: string; itemId: string; locationId: string };

/** An item in a place, with an opening movement, created the way the module creates one. */
async function seed(qtyE6 = units(40)): Promise<Seeded> {
	const owner = await createUser();
	const business = await createBusiness(owner.id, 'Thornhill Joinery');

	const locationId = randomUUID();
	const itemId = randomUUID();

	await runScoped(business.id, owner.id, async (tx) => {
		await tx.execute(sql`
			insert into inventory_location (id, business_id, name)
			values (${locationId}, ${business.id}, 'Rack A')
		`);
		await tx.execute(sql`
			insert into inventory_item (id, business_id, name, unit, cost_micros, reorder_point_e6)
			values (${itemId}, ${business.id}, 'European oak, 40mm board', 'board', 1780000000, ${units(12)})
		`);
		await tx.execute(sql`
			insert into inventory_movement
				(business_id, item_id, location_id, qty_e6, reason, occurred_on)
			values (${business.id}, ${itemId}, ${locationId}, ${qtyE6}, 'opening', '2026-07-01')
		`);
	});

	return { businessId: business.id, userId: owner.id, itemId, locationId };
}

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

describe('inventory_level is derived, never written', () => {
	/**
	 * `security_invoker` on a view arrived in PostgreSQL 15. Asserted rather than assumed, because
	 * a downgrade would not fail — it would silently start executing the view as its owner, which
	 * `FORCE ROW LEVEL SECURITY` does not constrain, and every business would read every other's
	 * stock while the screen looked perfect.
	 */
	it('runs on a Postgres that has security_invoker', async () => {
		const { businessId, userId } = await seed();

		await runScoped(businessId, userId, async (tx) => {
			const result = await tx.execute(sql`select current_setting('server_version_num')::int as v`);
			expect(Number((result.rows[0] as { v: number }).v)).toBeGreaterThanOrEqual(150000);
		});
	});

	it('is declared with security_invoker', async () => {
		const { businessId, userId } = await seed();

		await runScoped(businessId, userId, async (tx) => {
			const result = await tx.execute(sql`
				select reloptions from pg_class
				 where relname = 'inventory_level' and relkind = 'v'
			`);
			expect(String((result.rows[0] as { reloptions: string[] }).reloptions)).toContain(
				'security_invoker=true'
			);
		});
	});

	it('reflects a movement without anybody writing a level', async () => {
		const { businessId, userId, itemId } = await seed(units(40));

		await runScoped(businessId, userId, async (tx) => {
			const before = await tx.execute(
				sql`select qty_e6 from inventory_level where item_id = ${itemId}`
			);
			expect(Number((before.rows[0] as { qty_e6: string }).qty_e6)).toBe(units(40));
		});
	});

	it('sums signed movements, so stock going out reduces it', async () => {
		const { businessId, userId, itemId, locationId } = await seed(units(40));

		await runScoped(businessId, userId, async (tx) => {
			await tx.execute(sql`
				insert into inventory_movement
					(business_id, item_id, location_id, qty_e6, reason, source_id, occurred_on)
				values (${businessId}, ${itemId}, ${locationId}, ${units(-4)}, 'stock_count', ${randomUUID()}, '2026-07-31')
			`);

			const after = await tx.execute(
				sql`select qty_e6 from inventory_level where item_id = ${itemId}`
			);
			expect(Number((after.rows[0] as { qty_e6: string }).qty_e6)).toBe(units(36));
		});
	});

	/** The criterion in T23's own words: it cannot be written directly. */
	it('refuses a direct INSERT', async () => {
		const { businessId, userId, itemId, locationId } = await seed();

		const message = await messageFromRejection(
			runScoped(businessId, userId, (tx) =>
				tx.execute(sql`
					insert into inventory_level (business_id, item_id, location_id, qty_e6)
					values (${businessId}, ${itemId}, ${locationId}, ${units(999)})
				`)
			)
		);

		expect(message).toMatch(/permission denied|cannot insert/i);
	});

	it('refuses a direct UPDATE', async () => {
		const { businessId, userId, itemId } = await seed();

		const message = await messageFromRejection(
			runScoped(businessId, userId, (tx) =>
				tx.execute(sql`update inventory_level set qty_e6 = ${units(999)} where item_id = ${itemId}`)
			)
		);

		expect(message).toMatch(/permission denied|cannot update/i);
	});

	/** Regression-proof: the grant itself, not just the behaviour it produces today. */
	it('grants the application role SELECT and nothing else', async () => {
		const { businessId, userId } = await seed();

		await runScoped(businessId, userId, async (tx) => {
			const result = await tx.execute(sql`
				select has_table_privilege('cjs_app', 'inventory_level', 'SELECT') as can_read,
				       has_table_privilege('cjs_app', 'inventory_level', 'INSERT') as can_insert,
				       has_table_privilege('cjs_app', 'inventory_level', 'UPDATE') as can_update
			`);
			const row = result.rows[0] as Record<string, boolean>;
			expect(row.can_read).toBe(true);
			expect(row.can_insert).toBe(false);
			expect(row.can_update).toBe(false);
		});
	});

	/**
	 * THE ONE THAT MATTERS MOST. Without `security_invoker`, this is the test that fails — and
	 * without this test, nothing in the codebase would notice.
	 */
	it('shows one business nothing of another business, through the view', async () => {
		const a = await seed(units(40));
		const b = await seed(units(7));

		await runScoped(a.businessId, a.userId, async (tx) => {
			const rows = await tx.execute(sql`select item_id, qty_e6 from inventory_level`);
			expect(rows.rows).toHaveLength(1);
			expect((rows.rows[0] as { item_id: string }).item_id).toBe(a.itemId);
		});

		await runScoped(b.businessId, b.userId, async (tx) => {
			const rows = await tx.execute(sql`select item_id, qty_e6 from inventory_level`);
			expect(rows.rows).toHaveLength(1);
			expect((rows.rows[0] as { item_id: string }).item_id).toBe(b.itemId);
		});
	});
});

describe('a movement is a record of something that happened', () => {
	it('refuses an UPDATE, and says what to do instead', async () => {
		const { businessId, userId, itemId } = await seed();

		const message = await messageFromRejection(
			runScoped(businessId, userId, (tx) =>
				tx.execute(
					sql`update inventory_movement set qty_e6 = ${units(1)} where item_id = ${itemId}`
				)
			)
		);

		expect(message).toMatch(/cannot be changed/i);
		expect(message).toMatch(/correcting movement/i);
	});

	/** DELETE is revoked across `public` by 0003. Asserted here so the module owns its own proof. */
	it('refuses a DELETE', async () => {
		const { businessId, userId, itemId } = await seed();

		const message = await messageFromRejection(
			runScoped(businessId, userId, (tx) =>
				tx.execute(sql`delete from inventory_movement where item_id = ${itemId}`)
			)
		);

		expect(message).toMatch(/permission denied/i);
	});

	/** A movement of nothing records nothing, and would be a row that says only "someone looked". */
	it('refuses a movement of zero', async () => {
		const { businessId, userId, itemId, locationId } = await seed();

		const message = await messageFromRejection(
			runScoped(businessId, userId, (tx) =>
				tx.execute(sql`
					insert into inventory_movement
						(business_id, item_id, location_id, qty_e6, reason, occurred_on)
					values (${businessId}, ${itemId}, ${locationId}, 0, 'correction', '2026-07-01')
				`)
			)
		);

		expect(message).toMatch(/qty_not_zero/i);
	});

	/** A movement caused by a document names it, or the history cannot explain itself. */
	it('refuses a document-caused movement that names no document', async () => {
		const { businessId, userId, itemId, locationId } = await seed();

		const message = await messageFromRejection(
			runScoped(businessId, userId, (tx) =>
				tx.execute(sql`
					insert into inventory_movement
						(business_id, item_id, location_id, qty_e6, reason, occurred_on)
					values (${businessId}, ${itemId}, ${locationId}, ${units(-1)}, 'invoice', '2026-07-01')
				`)
			)
		);

		expect(message).toMatch(/source_shape/i);
	});
});

describe('a count changes nothing until it is applied', () => {
	async function startCount(s: Seeded, expected = units(18)) {
		const countId = randomUUID();

		await runScoped(s.businessId, s.userId, async (tx) => {
			await tx.execute(sql`
				insert into inventory_stock_count
					(id, business_id, number_prefix, number_value, number_formatted,
					 period_start, period_end, status)
				values (${countId}, ${s.businessId}, 'SC', 1, 'SC-0001', '2026-07-01', '2026-07-31', 'preparing')
			`);
			await tx.execute(sql`
				insert into inventory_stock_count_line
					(business_id, stock_count_id, item_id, location_id, expected_qty_e6, unit_cost_micros)
				values (${s.businessId}, ${countId}, ${s.itemId}, ${s.locationId}, ${expected}, 1780000000)
			`);
			await tx.execute(
				sql`update inventory_stock_count set status = 'counting' where id = ${countId}`
			);
		});

		return countId;
	}

	it('leaves the level untouched while counting', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);

		await runScoped(s.businessId, s.userId, async (tx) => {
			await tx.execute(sql`
				update inventory_stock_count_line
				   set counted_qty_e6 = ${units(14)}, counted_at = now()
				 where stock_count_id = ${countId}
			`);

			const level = await tx.execute(
				sql`select qty_e6 from inventory_level where item_id = ${s.itemId}`
			);
			expect(Number((level.rows[0] as { qty_e6: string }).qty_e6)).toBe(units(18));
		});
	});

	/**
	 * "Not yet counted" and "counted zero" are different facts about the world — one is an empty
	 * row on a clipboard, the other is an empty shelf — and the column has to be able to hold
	 * both.
	 */
	it('distinguishes not-yet-counted from counted-zero', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);

		await runScoped(s.businessId, s.userId, async (tx) => {
			const notYet = await tx.execute(
				sql`select counted_qty_e6, counted_at from inventory_stock_count_line where stock_count_id = ${countId}`
			);
			expect((notYet.rows[0] as { counted_qty_e6: string | null }).counted_qty_e6).toBeNull();

			await tx.execute(sql`
				update inventory_stock_count_line set counted_qty_e6 = 0, counted_at = now()
				 where stock_count_id = ${countId}
			`);

			const zero = await tx.execute(
				sql`select counted_qty_e6 from inventory_stock_count_line where stock_count_id = ${countId}`
			);
			expect(Number((zero.rows[0] as { counted_qty_e6: string }).counted_qty_e6)).toBe(0);
		});
	});

	/** A counted quantity without a time would be a number nobody can date. */
	it('refuses a counted quantity with no time against it', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);

		const message = await messageFromRejection(
			runScoped(s.businessId, s.userId, (tx) =>
				tx.execute(sql`
					update inventory_stock_count_line set counted_qty_e6 = ${units(14)}
					 where stock_count_id = ${countId}
				`)
			)
		);

		expect(message).toMatch(/counted_complete/i);
	});

	/**
	 * THE SNAPSHOT. Stock moving during a count must not change what the counter is comparing
	 * against, or the person holding the clipboard is blamed for the difference.
	 */
	it('refuses to change an expected quantity once the count has been prepared', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);

		const message = await messageFromRejection(
			runScoped(s.businessId, s.userId, (tx) =>
				tx.execute(sql`
					update inventory_stock_count_line set expected_qty_e6 = ${units(99)}
					 where stock_count_id = ${countId}
				`)
			)
		);

		expect(message).toMatch(/snapshot/i);
	});

	it('refuses a new line once the count has been prepared', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);
		const other = randomUUID();

		const message = await messageFromRejection(
			runScoped(s.businessId, s.userId, async (tx) => {
				await tx.execute(sql`
					insert into inventory_item (id, business_id, name, unit)
					values (${other}, ${s.businessId}, 'Danish oil, 5L', 'litre')
				`);
				await tx.execute(sql`
					insert into inventory_stock_count_line
						(business_id, stock_count_id, item_id, location_id, expected_qty_e6)
					values (${s.businessId}, ${countId}, ${other}, ${s.locationId}, ${units(3)})
				`);
			})
		);

		expect(message).toMatch(/no more lines can be added/i);
	});

	it('refuses to go back to preparing', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);

		const message = await messageFromRejection(
			runScoped(s.businessId, s.userId, (tx) =>
				tx.execute(sql`update inventory_stock_count set status = 'preparing' where id = ${countId}`)
			)
		);

		expect(message).toMatch(/cannot go back to preparing/i);
	});

	/** Re-running an applied count would move every quantity in the business a second time. */
	it('refuses to reopen an applied count', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);

		await runScoped(s.businessId, s.userId, (tx) =>
			tx.execute(sql`
				update inventory_stock_count set status = 'applied', applied_at = now()
				 where id = ${countId}
			`)
		);

		const message = await messageFromRejection(
			runScoped(s.businessId, s.userId, (tx) =>
				tx.execute(sql`update inventory_stock_count set status = 'counting' where id = ${countId}`)
			)
		);

		expect(message).toMatch(/cannot be undone/i);
	});

	/** The status and its evidence move together, or a change exists that nobody can date. */
	it('refuses an applied count with no applied_at', async () => {
		const s = await seed(units(18));
		const countId = await startCount(s);

		const message = await messageFromRejection(
			runScoped(s.businessId, s.userId, (tx) =>
				tx.execute(sql`update inventory_stock_count set status = 'applied' where id = ${countId}`)
			)
		);

		expect(message).toMatch(/applied_has_date/i);
	});
});
