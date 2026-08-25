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
import { asc, eq, sql } from 'drizzle-orm';
import { formatZar } from '$lib/core/money';
import { isBelowReorderPoint } from '$lib/core/inventory';
import { closePool, runScoped } from '$lib/server/core/db/client';
import { stockCount, stockCountLine } from '$lib/server/core/db/schema/inventory';
import {
	cleanupFixtures,
	createBusiness,
	createUser,
	eventFor,
	localsFor,
	messageFromRejection
} from '$lib/server/core/db/fixtures';
import { withBusiness, type Ctx } from '$lib/server/core/ctx';
import { loadAccess } from '$lib/server/core/entitlement';
import { addModule } from '$lib/server/core/modules/subscribe';
import { archiveItem, createItem, recordMovement, CannotDoThat } from './effects';
import { applyCount, prepareCount, reviewCount, saveCountLine } from './counts';
import { countItems, listItems, listMovements, loadItem, summarise } from './queries';
import { summariseInventory } from './summary';

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

/**
 * WHAT HOME IS TOLD, against real rows.
 *
 * The sentences themselves are proven in `core/inventory/inventory.test.ts`, where they cost
 * nothing to enumerate. What needs Postgres is everything around them: that the count Home
 * states and the count the `Running low` tab states come from one predicate, that an archived
 * item leaves both numbers, that the names arrive alphabetically and agree with the count they
 * are subtracted from, and that a stock count somebody walked away from is found by its status
 * rather than by when its header last happened to move.
 */
describe('what Home is told about stock', () => {
	async function homeTenant() {
		const owner = await createUser('Alice Thornhill');
		const business = await createBusiness(owner.id, 'Thornhill Joinery');
		return { owner, business, businessId: business.id, userId: owner.id };
	}

	type HomeSeeded = Awaited<ReturnType<typeof homeTenant>>;

	/** A `Ctx` whose access map is read from the database, so each step sees the last one's work. */
	async function act<T>(t: HomeSeeded, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
		const locals = await localsFor(t.owner, t.business);
		const access = await runScoped(t.businessId, t.userId, (tx) => loadAccess(tx));
		return withBusiness(eventFor({ ...locals, access }), fn);
	}

	/** Exactly what `home/load.ts` does: one scoped transaction, one clock reading. */
	function homeSays(t: HomeSeeded, now = new Date()) {
		return act(t, (ctx) =>
			summariseInventory({ tx: ctx.tx, business: ctx.business, access: ctx.access, now })
		);
	}

	/**
	 * `createBusiness` subscribes to nothing, and `readiness` needs an open period — so the empty
	 * state has to be bought the way a real business buys it.
	 */
	async function ownInventory(t: HomeSeeded) {
		await act(t, (ctx) => addModule(ctx, 'inventory', new Date('2026-07-14T09:00:00+02:00')));
	}

	describe('the standing point', () => {
		it('reassures rather than saying "0 items counted" when nothing is in it yet', async () => {
			const t = await homeTenant();
			await ownInventory(t);

			const { standing } = await homeSays(t);

			expect(standing?.statement).toBe('Inventory is ready when you are');
			expect(standing?.explanation).toMatch(/Nothing counted yet\.$/);
			// Not having used something yet is not a problem, and there is nowhere to go about it.
			expect(standing?.standing).toBe('clear');
			expect(standing?.href).toBeNull();
		});

		/**
		 * A subscription that changed underneath the request. Half a claim is worse than none, so
		 * the module contributes nothing — and `composeStanding` simply has one fewer point.
		 */
		it('says nothing at all when the module is not owned and has nothing in it', async () => {
			const t = await homeTenant();

			const summary = await homeSays(t);

			expect(summary.standing).toBeNull();
			expect(summary.resume).toEqual([]);
		});

		it('counts what is there and states the zero rather than hiding it', async () => {
			const t = await homeTenant();
			await addItem(t, 'European oak, 40mm board', { reorder: units(12), qty: units(40) });
			await addItem(t, 'Birch ply, 18mm sheet', { reorder: units(5), qty: units(30) });

			const { standing } = await homeSays(t);

			expect(standing).toMatchObject({
				module: 'inventory',
				standing: 'clear',
				statement: '2 items counted',
				explanation: 'None running low.',
				href: '/inventory'
			});
		});

		it('names the item that is running low, rather than saying "check your stock"', async () => {
			const t = await homeTenant();
			await addItem(t, 'Danish oil, 5L', { reorder: units(12), qty: units(4) });
			await addItem(t, 'European oak, 40mm board', { reorder: units(12), qty: units(40) });

			const { standing } = await homeSays(t);

			expect(standing?.standing).toBe('attention');
			expect(standing?.statement).toBe('1 item is running low');
			expect(standing?.explanation).toBe('Danish oil, 5L. Out of 2 items you count.');
			// One click from the sentence to the three items it is about.
			expect(standing?.href).toBe('/inventory?filter=low');
		});

		/**
		 * Two names, then a count — and the names come back ALPHABETICAL, so the ticket's
		 * illustrative "European oak, Danish oil and one other" reads the other way round here.
		 */
		it('names two and counts the rest', async () => {
			const t = await homeTenant();
			for (const name of ['European oak', 'Danish oil', 'Sash clamp', 'Brass screws']) {
				await addItem(t, name, { reorder: units(12), qty: units(4) });
			}
			await addItem(t, 'Birch ply', { reorder: units(1), qty: units(30) });

			const { standing } = await homeSays(t);

			expect(standing?.statement).toBe('4 items are running low');
			expect(standing?.explanation).toBe(
				'Brass screws · Danish oil · and 2 others. Out of 5 items you count.'
			);
		});

		/**
		 * THE NUMBER ON HOME IS THE NUMBER ON THE TAB. Both come from `lowPredicate`, and this is
		 * the assertion that keeps them from drifting apart — including at the boundary, where a
		 * second definition would first disagree.
		 */
		it('agrees with the list, including exactly at the reorder point', async () => {
			const t = await homeTenant();
			await addItem(t, 'Below', { reorder: units(12), qty: units(11) });
			await addItem(t, 'Exactly at', { reorder: units(12), qty: units(12) });
			await addItem(t, 'Above', { reorder: units(12), qty: units(13) });

			const { standing } = await homeSays(t);
			const counts = await runScoped(t.businessId, t.userId, (tx) => countItems(tx));

			expect(counts.low).toBe(1);
			expect(standing?.statement).toBe('1 item is running low');
			// The one exactly at its point is not a concern — `isBelowReorderPoint` is strictly below.
			expect(standing?.explanation).toBe('Below. Out of 3 items you count.');
		});

		/**
		 * An archived item reports as archived and nothing else. Urgency about stock the business
		 * has said it no longer keeps would be the interface arguing with a decision already made.
		 */
		it('leaves archived items out of both numbers', async () => {
			const t = await homeTenant();
			const gone = await addItem(t, 'Danish oil, 5L', { reorder: units(12), qty: units(4) });
			await addItem(t, 'European oak, 40mm board', { reorder: units(12), qty: units(40) });

			expect((await homeSays(t)).standing?.standing).toBe('attention');

			await runScoped(t.businessId, t.userId, (tx) => archiveItem(tx, gone));

			const { standing } = await homeSays(t);
			expect(standing?.standing).toBe('clear');
			expect(standing?.statement).toBe('1 item counted');
		});
	});

	/**
	 * THE ACCEPTANCE CRITERION AS A TEST, not as a promise in a comment. Stock on hand is an asset,
	 * not money in or out this month, and the day somebody adds a valuation to the month panel this
	 * is what stops it.
	 */
	it('contributes no figure and nothing dated, ever', async () => {
		const t = await homeTenant();
		await addItem(t, 'European oak, 40mm board', { cost: rand(1780), qty: units(40) });

		const healthy = await homeSays(t);
		expect(healthy.figures).toEqual([]);
		expect(healthy.agenda).toEqual([]);

		await addItem(t, 'Danish oil, 5L', { cost: rand(420), reorder: units(12), qty: units(1) });

		const concerned = await homeSays(t);
		expect(concerned.standing?.standing).toBe('attention');
		expect(concerned.figures).toEqual([]);
		expect(concerned.agenda).toEqual([]);
	});

	describe('the stock count you can come back to', () => {
		/** Four items, a count prepared over them, and the first `counted` of them counted. */
		async function countOf(t: HomeSeeded, counted: number) {
			for (const n of [1, 2, 3, 4]) await addItem(t, `Item ${n}`, { qty: units(10) });

			const countId = await runScoped(t.businessId, t.userId, (tx) =>
				prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
			);

			await runScoped(t.businessId, t.userId, async (tx) => {
				const lines = await tx
					.select({ id: stockCountLine.id })
					.from(stockCountLine)
					.where(eq(stockCountLine.stockCountId, countId))
					.orderBy(asc(stockCountLine.position));

				for (const line of lines.slice(0, counted)) {
					await saveCountLine(tx, line.id, units(10), t.userId);
				}
			});

			return countId;
		}

		it('offers nothing when there is no count', async () => {
			const t = await homeTenant();
			await addItem(t, 'European oak, 40mm board');

			expect((await homeSays(t)).resume).toEqual([]);
		});

		it('names the count, its progress, and where to go back to', async () => {
			const t = await homeTenant();
			const countId = await countOf(t, 2);

			const { resume } = await homeSays(t);

			expect(resume).toHaveLength(1);
			expect(resume[0]).toEqual({
				module: 'inventory',
				id: countId,
				title: 'Stock count · July',
				context: '2 of 4 counted',
				href: `/inventory/counts/${countId}`
			});
		});

		/** Nobody has started yet, but there IS something to come back to. */
		it('shows a count nobody has counted anything on', async () => {
			const t = await homeTenant();
			await countOf(t, 0);

			expect((await homeSays(t)).resume[0].context).toBe('0 of 4 counted');
		});

		/**
		 * The un-count path. "Actually, I have not looked at this one yet" has to move the progress
		 * back, which it only does if the card reads the NULL rather than a counter.
		 */
		it('moves the progress back when a line is un-counted', async () => {
			const t = await homeTenant();
			const countId = await countOf(t, 2);

			await runScoped(t.businessId, t.userId, async (tx) => {
				const [line] = await tx
					.select({ id: stockCountLine.id })
					.from(stockCountLine)
					.where(eq(stockCountLine.stockCountId, countId))
					.orderBy(asc(stockCountLine.position));

				await saveCountLine(tx, line.id, null, t.userId);
			});

			expect((await homeSays(t)).resume[0].context).toBe('1 of 4 counted');
		});

		/** A count at review has committed nothing yet, so it is still work to come back to. */
		it('still offers a count that has reached review', async () => {
			const t = await homeTenant();
			const countId = await countOf(t, 4);

			// SPA-7 owns this transition; the trigger already permits counting -> reviewing.
			await runScoped(t.businessId, t.userId, (tx) =>
				tx.update(stockCount).set({ status: 'reviewing' }).where(eq(stockCount.id, countId))
			);

			expect((await homeSays(t)).resume[0].id).toBe(countId);
		});

		it('offers nothing once the count has been applied', async () => {
			const t = await homeTenant();
			const countId = await countOf(t, 4);

			await runScoped(t.businessId, t.userId, (tx) =>
				applyCount(tx, t.businessId, countId, t.userId)
			);

			expect((await homeSays(t)).resume).toEqual([]);
		});

		/**
		 * One card, never a list — and the one shown is the count most recently STARTED. Ordering
		 * on `updatedAt` would be wrong here in a way that only shows up in use: counting an item
		 * updates the LINE, and the header's touch trigger fires only when the header itself moves.
		 */
		it('offers only the most recently started count', async () => {
			const t = await homeTenant();
			await countOf(t, 1);
			const newer = await runScoped(t.businessId, t.userId, (tx) =>
				prepareCount(tx, t.businessId, t.userId, { start: '2026-08-01', end: '2026-08-31' })
			);

			const { resume } = await homeSays(t);

			expect(resume).toHaveLength(1);
			expect(resume[0].id).toBe(newer);
			expect(resume[0].title).toBe('Stock count · August');
		});

		/** A business with nothing placed anywhere gets a count with no lines in it. */
		it('does not claim progress on a count with no lines', async () => {
			const t = await homeTenant();
			await runScoped(t.businessId, t.userId, (tx) =>
				prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
			);

			expect((await homeSays(t)).resume[0].context).toBe('Nothing to count yet');
		});
	});
});
