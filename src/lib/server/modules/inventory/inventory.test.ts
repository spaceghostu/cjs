/**
 * INVENTORY AGAINST A REAL DATABASE.
 *
 * The pure arithmetic is proven in `$lib/core/inventory/inventory.test.ts`. This file proves the
 * things that only Postgres can answer: that the level really is derived, that applying a count
 * is atomic, that the SQL predicate for "running low" agrees with the TypeScript one, and that
 * the design's own worked example reproduces from real rows.
 *
 * Requires a database: `bun run db:dev`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { formatZar } from '$lib/core/money';
import { isBelowReorderPoint } from '$lib/core/inventory';
import { closePool, runScoped } from '$lib/server/core/db/client';
import { stockCountLine } from '$lib/server/core/db/schema/inventory';
import {
	cleanupFixtures,
	createBusiness,
	createUser,
	messageFromRejection
} from '$lib/server/core/db/fixtures';
import { createItem, recordMovement, CannotDoThat } from './effects';
import { applyCount, prepareCount, reviewCount, saveCountLine } from './counts';
import { countItems, listItems, listMovements, loadItem, summarise } from './queries';

/** Millionths of a unit. */
const units = (n: number) => n * 1_000_000;
/** Millionths of a rand. R1 780 -> 1_780_000_000. */
const rand = (n: number) => n * 1_000_000;

/** `formatZar` uses a NON-BREAKING space between thousands. See the note in the core tests. */
const nb = (s: string) => s.replaceAll(' ', '\u00a0');

async function tenant() {
	const owner = await createUser();
	const business = await createBusiness(owner.id, 'Thornhill Joinery');
	return { businessId: business.id, userId: owner.id };
}

type Seeded = Awaited<ReturnType<typeof tenant>>;

async function addItem(
	t: Seeded,
	name: string,
	opts: { cost?: number | null; reorder?: number; qty?: number; place?: string } = {}
) {
	const { cost = rand(1780), reorder = units(12), qty = units(40), place = 'Rack A' } = opts;

	return runScoped(t.businessId, t.userId, (tx) =>
		createItem(
			tx,
			t.businessId,
			t.userId,
			{
				name,
				sku: null,
				description: null,
				unit: 'board',
				costMicros: cost,
				sellMicros: null,
				reorderPointE6: reorder,
				defaultLocationId: null,
				newLocationName: place
			},
			qty === 0 ? null : { qtyE6: qty, locationId: null }
		)
	);
}

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

describe('creating an item writes a movement, never a level', () => {
	it('records the opening quantity as an opening movement', async () => {
		const t = await tenant();
		const id = await addItem(t, 'European oak, 40mm board', { qty: units(40) });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const history = await listMovements(tx, id);
			expect(history.total).toBe(1);
			expect(history.movements[0].reason).toBe('opening');
			expect(history.movements[0].qty.e6).toBe(units(40));

			const row = await loadItem(tx, id);
			expect(row?.onHand.e6).toBe(units(40));
		});
	});

	/** An item created with no opening quantity has none — and no movement claiming otherwise. */
	it('writes no movement when no opening quantity was given', async () => {
		const t = await tenant();
		const id = await addItem(t, 'Danish oil, 5L', { qty: 0 });

		await runScoped(t.businessId, t.userId, async (tx) => {
			expect((await listMovements(tx, id)).total).toBe(0);
			expect((await loadItem(tx, id))?.onHand.e6).toBe(0);
		});
	});

	it('reuses a location typed with different capitalisation', async () => {
		const t = await tenant();
		await addItem(t, 'Birch ply, 18mm sheet', { place: 'Rack A' });
		await addItem(t, 'Sash clamp, 900mm', { place: 'rack a' });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const rows = await tx.execute(sql`select count(*)::int as n from inventory_location`);
			expect(Number((rows.rows[0] as { n: number }).n)).toBe(1);
		});
	});

	/** A stock ledger where a number can move for no stated reason is one nobody can rely on. */
	it('refuses a correction with no explanation', async () => {
		const t = await tenant();
		const id = await addItem(t, 'Brass screws 4x40');

		const message = await messageFromRejection(
			runScoped(t.businessId, t.userId, async (tx) => {
				const [place] = await tx
					.execute(sql`select id from inventory_location limit 1`)
					.then((r) => r.rows as { id: string }[]);
				return recordMovement(tx, t.businessId, t.userId, {
					itemId: id,
					locationId: place.id,
					qtyE6: units(-1),
					reason: 'correction',
					note: '  ',
					occurredOn: '2026-07-15'
				});
			})
		);

		expect(message).toMatch(/Say what you are correcting/i);
	});
});

describe('the list', () => {
	it('reads a quantity with no movements as a real zero', async () => {
		const t = await tenant();
		await addItem(t, 'Danish oil, 5L', { qty: 0 });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const page = await listItems(tx);
			expect(page.items).toHaveLength(1);
			expect(page.items[0].onHand.e6).toBe(0);
		});
	});

	it('is bounded even when asked for more than the ceiling', async () => {
		const t = await tenant();
		await addItem(t, 'European oak, 40mm board');

		await runScoped(t.businessId, t.userId, async (tx) => {
			const page = await listItems(tx, { pageSize: 10_000 });
			expect(page.pageSize).toBe(500);
		});
	});

	it('pages, with a stable order across pages', async () => {
		const t = await tenant();
		for (const n of [1, 2, 3, 4, 5]) await addItem(t, `Item ${n}`, { qty: units(10) });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const first = await listItems(tx, { pageSize: 2, page: 1 });
			const second = await listItems(tx, { pageSize: 2, page: 2 });

			expect(first.total).toBe(5);
			expect(first.items).toHaveLength(2);
			const ids = [...first.items, ...second.items].map((i) => i.item.id);
			expect(new Set(ids).size).toBe(4);
		});
	});

	/**
	 * THE TWO DEFINITIONS AGREE. The tab count comes from SQL and the row's badge comes from
	 * TypeScript, and two definitions of one predicate is how a tab saying `Running low 3` ends
	 * up listing four rows. Asserted at the boundary, which is where they would first diverge.
	 */
	it('agrees with the pure predicate, including exactly at the reorder point', async () => {
		const t = await tenant();
		await addItem(t, 'Below', { reorder: units(12), qty: units(11) });
		await addItem(t, 'Exactly at', { reorder: units(12), qty: units(12) });
		await addItem(t, 'Above', { reorder: units(12), qty: units(13) });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const counts = await countItems(tx);
			const page = await listItems(tx);

			// The row goes straight into the pure predicate — no re-shaping, so the test cannot
			// accidentally compare a hand-built object against what SQL actually saw.
			const lowInTs = page.items.filter((row) => isBelowReorderPoint(row.item, row.onHand));

			expect(counts.low).toBe(1);
			expect(lowInTs).toHaveLength(1);
			expect(lowInTs[0].item.name).toBe('Below');

			const lowPage = await listItems(tx, { filter: 'low' });
			expect(lowPage.items.map((i) => i.item.name)).toEqual(['Below']);
		});
	});

	it('states a zero count rather than omitting it', async () => {
		const t = await tenant();
		await addItem(t, 'Plenty', { reorder: units(1), qty: units(90) });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const counts = await countItems(tx);
			expect(counts.low).toBe(0);
			expect(counts).toHaveProperty('archived', 0);
		});
	});

	/** An item with no recorded cost is left out of the valuation and counted, not folded in. */
	it('reports what it could not value', async () => {
		const t = await tenant();
		await addItem(t, 'Costed', { cost: rand(100), qty: units(10) });
		await addItem(t, 'Uncosted', { cost: null, qty: units(10) });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const s = await summarise(tx);
			expect(s.itemCount).toBe(2);
			expect(s.uncosted).toBe(1);
			expect(formatZar(s.valueAtCost)).toBe(nb('R1 000,00'));
		});
	});
});

describe('the item history', () => {
	/**
	 * The on-screen proof of "quantities are read from movements, never from a writable level":
	 * the newest row's running balance IS the level.
	 */
	it('ends at the same number the level view reports', async () => {
		const t = await tenant();
		const id = await addItem(t, 'European oak, 40mm board', { qty: units(40) });

		await runScoped(t.businessId, t.userId, async (tx) => {
			const [place] = (await tx.execute(sql`select id from inventory_location limit 1`)).rows as {
				id: string;
			}[];

			await recordMovement(tx, t.businessId, t.userId, {
				itemId: id,
				locationId: place.id,
				qtyE6: units(-4),
				reason: 'correction',
				note: 'Two broke in the rack',
				occurredOn: '2026-07-20'
			});

			const history = await listMovements(tx, id);
			const item = await loadItem(tx, id);

			expect(history.movements[0].balanceAfter.e6).toBe(item?.onHand.e6);
			expect(item?.onHand.e6).toBe(units(36));
		});
	});

	it('carries a reason on every row', async () => {
		const t = await tenant();
		const id = await addItem(t, 'European oak, 40mm board');

		await runScoped(t.businessId, t.userId, async (tx) => {
			const history = await listMovements(tx, id);
			expect(history.movements.every((m) => Boolean(m.reason))).toBe(true);
		});
	});
});

describe("the design's worked stock count", () => {
	/**
	 * T23's own line: European oak, expected 18, counted 14, difference -4, value effect -R7 120
	 * at R1 780 a board — reproduced end to end from real rows, through prepare, count and apply.
	 */
	it('reproduces -4 and -R7 120 from the database', async () => {
		const t = await tenant();
		const oak = await addItem(t, 'European oak, 40mm board', {
			cost: rand(1780),
			qty: units(18)
		});

		const countId = await runScoped(t.businessId, t.userId, (tx) =>
			prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
		);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const [line] = await tx
				.select({ id: stockCountLine.id, expected: stockCountLine.expectedQtyE6 })
				.from(stockCountLine)
				.where(eq(stockCountLine.stockCountId, countId));

			expect(Number(line.expected)).toBe(units(18));
			await saveCountLine(tx, line.id, units(14), t.userId);

			const review = await reviewCount(tx, countId);
			expect(review.changes).toBe(1);
			expect(formatZar(review.net)).toBe(nb('-R7 120,00'));
		});

		await runScoped(t.businessId, t.userId, async (tx) => {
			const result = await applyCount(tx, t.businessId, countId, t.userId);
			expect(result.movements).toBe(1);
			expect(formatZar(result.net)).toBe(nb('-R7 120,00'));

			const after = await loadItem(tx, oak);
			expect(after?.onHand.e6).toBe(units(14));
		});
	});

	/**
	 * The full worked count: 47 of 48 counted, five varying, netting -R8 000. Built from the
	 * design's own oak line plus four more that make up the difference exactly.
	 */
	it('nets -R8 000 across 47 of 48 items', async () => {
		const t = await tenant();

		const plan = [
			{ name: 'European oak, 40mm board', cost: rand(1780), expected: 18, counted: 14 },
			{ name: 'Birch ply, 18mm sheet', cost: rand(400), expected: 9, counted: 12 },
			{ name: 'Sash clamp, 900mm', cost: rand(650), expected: 6, counted: 4 },
			{ name: 'Brass screws 4x40', cost: rand(96), expected: 40, counted: 45 },
			{ name: 'Danish oil, 5L', cost: rand(420), expected: 11, counted: 8 }
		];

		const ids = new Map<string, string>();
		for (const row of plan) {
			ids.set(row.name, await addItem(t, row.name, { cost: row.cost, qty: units(row.expected) }));
		}
		// 42 that match exactly, plus one nobody gets to — 48 lines in all.
		for (let n = 0; n < 43; n++) {
			ids.set(
				`Matching ${n}`,
				await addItem(t, `Matching ${n}`, { cost: rand(10), qty: units(5) })
			);
		}

		const countId = await runScoped(t.businessId, t.userId, (tx) =>
			prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
		);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const lines = await tx
				.select({ id: stockCountLine.id, itemId: stockCountLine.itemId })
				.from(stockCountLine)
				.where(eq(stockCountLine.stockCountId, countId));

			expect(lines).toHaveLength(48);

			const varyingByItem = new Map(plan.map((p) => [ids.get(p.name)!, p.counted]));
			// One line is deliberately left uncounted — "not yet" is a real state, and 47 of 48 is
			// the design's own figure.
			const skip = ids.get('Matching 42')!;

			for (const line of lines) {
				if (line.itemId === skip) continue;
				const counted = varyingByItem.get(line.itemId);
				await saveCountLine(
					tx,
					line.id,
					counted !== undefined ? units(counted) : units(5),
					t.userId
				);
			}

			const review = await reviewCount(tx, countId);
			expect(review.counted).toBe(47);
			expect(review.total).toBe(48);
			expect(review.changes).toBe(5);
			expect(formatZar(review.net)).toBe(nb('-R8 000,00'));
		});

		await runScoped(t.businessId, t.userId, async (tx) => {
			const result = await applyCount(tx, t.businessId, countId, t.userId);
			expect(result.movements).toBe(5);
			expect(formatZar(result.net)).toBe(nb('-R8 000,00'));
		});
	});
});

describe('applying a count', () => {
	async function preparedCount(t: Seeded) {
		await addItem(t, 'European oak, 40mm board', { cost: rand(1780), qty: units(18) });
		return runScoped(t.businessId, t.userId, (tx) =>
			prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
		);
	}

	/** T24's promise, checked by looking: nothing moves before step 4. */
	it('changes no level while the count is open', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const [line] = await tx
				.select({ id: stockCountLine.id })
				.from(stockCountLine)
				.where(eq(stockCountLine.stockCountId, countId));

			await saveCountLine(tx, line.id, units(14), t.userId);

			const page = await listItems(tx);
			expect(page.items[0].onHand.e6).toBe(units(18));
		});
	});

	/** A count where everything matched happened, is recorded, and moved nothing. */
	it('writes nothing when every line matched', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const [line] = await tx
				.select({ id: stockCountLine.id })
				.from(stockCountLine)
				.where(eq(stockCountLine.stockCountId, countId));

			await saveCountLine(tx, line.id, units(18), t.userId);
			const result = await applyCount(tx, t.businessId, countId, t.userId);

			expect(result.movements).toBe(0);
			expect(result.net.cents).toBe(0);
		});
	});

	/** An uncounted line is not a finding, and must not be posted as a total loss. */
	it('writes nothing for a line nobody counted', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const result = await applyCount(tx, t.businessId, countId, t.userId);
			expect(result.movements).toBe(0);

			const page = await listItems(tx);
			expect(page.items[0].onHand.e6).toBe(units(18));
		});
	});

	it('refuses to apply twice', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);

		await runScoped(t.businessId, t.userId, (tx) =>
			applyCount(tx, t.businessId, countId, t.userId)
		);

		const message = await messageFromRejection(
			runScoped(t.businessId, t.userId, (tx) => applyCount(tx, t.businessId, countId, t.userId))
		);

		expect(message).toMatch(/already been applied/i);
	});

	/**
	 * ATOMICITY. The apply runs inside the caller's transaction, so a failure after some movements
	 * have been written must leave none of them. Provoked by throwing after the apply returns but
	 * before the transaction commits — which is exactly the shape of a real failure downstream.
	 */
	it('leaves nothing behind when the transaction fails part-way', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const [line] = await tx
				.select({ id: stockCountLine.id })
				.from(stockCountLine)
				.where(eq(stockCountLine.stockCountId, countId));
			await saveCountLine(tx, line.id, units(14), t.userId);
		});

		await expect(
			runScoped(t.businessId, t.userId, async (tx) => {
				await applyCount(tx, t.businessId, countId, t.userId);
				throw new CannotDoThat('something downstream went wrong');
			})
		).rejects.toThrow();

		await runScoped(t.businessId, t.userId, async (tx) => {
			// The movements are gone, the level is untouched, and the count is still open.
			const page = await listItems(tx);
			expect(page.items[0].onHand.e6).toBe(units(18));

			const count = await reviewCount(tx, countId);
			expect(count.changes).toBe(1);
		});
	});
});
