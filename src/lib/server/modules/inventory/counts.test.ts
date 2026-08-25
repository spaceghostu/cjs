/**
 * THE STOCK COUNT FLOW'S PROMISE, MADE EXECUTABLE.
 *
 * T24 puts one sentence on the screen — "Nothing changes in your stock until you've reviewed it
 * at step 3" — and a stepper cannot prove it. What proves it is looking at every quantity in the
 * business, mid-count, and finding all of them exactly where they were. That is this file.
 *
 * It sits beside `inventory.test.ts` rather than inside it because that file is at the 800-line
 * ceiling this codebase holds itself to, and because these are a different set of claims: not
 * "does the module work" but "does the FLOW keep the four promises it makes out loud".
 *
 *   1. Nothing writes to stock before step 4, verifiable by inspecting levels mid-count.
 *   2. The worked example reproduces: 47 of 48, five changes, net −R8 000, nothing uncosted.
 *   3. Applying writes exactly one movement per varying line, and refuses a second time.
 *   4. A counted ZERO is a variance; an uncounted line is not. The null is load-bearing.
 *   5. The door between step 2 and step 3 opens from one side each way, and never at all once
 *      the count has been applied. This is the promise "nothing commits until you've reviewed
 *      it" made of moving parts: `applyCount` is only ever offered a count that came through
 *      `beginReview`, so the transitions themselves have to be provably one-way-at-a-time.
 *   6. Two clicks on "start a count" produce ONE count. A check-then-act across two
 *      transactions is a race, and a burnt number with forty-eight orphaned lines behind it is
 *      what losing it looks like.
 *
 * The seeded count in `scripts/seed-dev.ts` is the same 48 lines and the same arithmetic, for
 * clicking through. This is the proof.
 *
 * Requires a database: `bun run db:dev`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { formatZar } from '$lib/core/money';
import { triageCount, type CountSheetRow } from '$lib/core/inventory';
import { closePool, runScoped } from '$lib/server/core/db/client';
import { stockCount, stockCountLine } from '$lib/server/core/db/schema/inventory';
import {
	cleanupFixtures,
	createBusiness,
	createUser,
	messageFromRejection
} from '$lib/server/core/db/fixtures';
import type { Tx } from '$lib/server/core/ctx';
import { createItem } from './effects';
import {
	applyCount,
	beginReview,
	prepareCount,
	resumeCounting,
	resumeOrPrepareCount,
	reviewCount,
	saveCountLine
} from './counts';
import { loadStockCount, loadStockCountLines } from './queries';

/** Millionths of a unit. */
const units = (n: number) => n * 1_000_000;
/** Millionths of a rand. R1 780 -> 1_780_000_000. */
const rand = (n: number) => n * 1_000_000;

/** `formatZar` uses a NON-BREAKING space between thousands. See the note in the core tests. */
const nb = (s: string) => s.replaceAll(' ', ' ');

/**
 * THE DESIGN'S FIVE VARIANCES, AND THE ARITHMETIC IS NOT NEGOTIABLE.
 *
 * European oak is pinned by T23 itself — expected 18, counted 14, −4 at R1 780 = −R7 120. The
 * other four therefore have to come to exactly −R880 for the footer's "net effect on stock value
 * −R8 000" to be the truth rather than a caption.
 *
 *     oak     −4 x R1 780 = −7 120
 *     ply     +3 x R400   = +1 200
 *     clamp   −2 x R650   = −1 300
 *     screws  +5 x R96    =   +480
 *     oil     −3 x R420   = −1 260
 *                           ───────
 *                           −8 000
 */
const VARYING: readonly { name: string; cost: number; expected: number; counted: number }[] = [
	{ name: 'European oak, 40mm board', cost: rand(1780), expected: 18, counted: 14 },
	{ name: 'Birch ply, 18mm sheet', cost: rand(400), expected: 9, counted: 12 },
	{ name: 'Sash clamp, 900mm', cost: rand(650), expected: 4, counted: 2 },
	{ name: 'Brass countersunk screws, 4x40', cost: rand(96), expected: 40, counted: 45 },
	{ name: 'Danish oil, 5L', cost: rand(420), expected: 8, counted: 5 }
];

/** The one shelf nobody reaches. COSTED, so "—" in the review means "not counted", not "unpriced". */
const NOT_YET = 'Worktop, walnut 3m';

const MATCHING = 42;

async function tenant() {
	const owner = await createUser();
	const business = await createBusiness(owner.id, 'Thornhill Joinery');
	return { businessId: business.id, userId: owner.id };
}

type Seeded = Awaited<ReturnType<typeof tenant>>;

async function addItem(t: Seeded, tx: Tx, name: string, cost: number | null, qty: number) {
	return createItem(
		tx,
		t.businessId,
		t.userId,
		{
			name,
			sku: null,
			description: null,
			unit: 'each',
			costMicros: cost,
			sellMicros: null,
			reorderPointE6: units(2),
			defaultLocationId: null,
			newLocationName: 'Rack A'
		},
		qty === 0 ? null : { qtyE6: units(qty), locationId: null }
	);
}

/**
 * FORTY-EIGHT ITEMS IN ONE PLACE EACH, so `prepareCount`'s one-line-per-level-row makes a sheet
 * of exactly 48 — the number T24's own figures are arithmetic over.
 */
async function sheetOf48(t: Seeded) {
	return runScoped(t.businessId, t.userId, async (tx) => {
		const ids = new Map<string, string>();
		for (const row of VARYING) {
			ids.set(row.name, await addItem(t, tx, row.name, row.cost, row.expected));
		}
		for (let n = 0; n < MATCHING; n++) {
			ids.set(`Matching ${n}`, await addItem(t, tx, `Matching ${n}`, rand(10), 5));
		}
		ids.set(NOT_YET, await addItem(t, tx, NOT_YET, rand(4100), 3));
		return ids;
	});
}

/** Every quantity in the business, in a form two snapshots can be compared with. */
async function levelSnapshot(t: Seeded): Promise<string> {
	return runScoped(t.businessId, t.userId, async (tx) => {
		const { rows } = await tx.execute<{ item_id: string; location_id: string; qty_e6: string }>(
			sql`select item_id, location_id, qty_e6::text as qty_e6
			      from inventory_level
			     order by item_id, location_id`
		);
		return rows.map((r) => `${r.item_id}/${r.location_id}=${r.qty_e6}`).join('\n');
	});
}

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

describe("T24's worked count, from real rows", () => {
	/**
	 * The whole flow in one test, because the claims are about the SEQUENCE: what is true before
	 * the apply is half the point, and splitting it would let the "nothing has moved" assertion
	 * pass against a count nobody had touched.
	 */
	it('counts 47 of 48, changes 5, nets −R8 000, and moves nothing until it is applied', async () => {
		const t = await tenant();
		const ids = await sheetOf48(t);

		const countId = await runScoped(t.businessId, t.userId, (tx) =>
			prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
		);

		const before = await levelSnapshot(t);
		expect(before.split('\n')).toHaveLength(48);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const lines = await tx
				.select({
					id: stockCountLine.id,
					itemId: stockCountLine.itemId,
					expected: stockCountLine.expectedQtyE6
				})
				.from(stockCountLine)
				.where(eq(stockCountLine.stockCountId, countId))
				.orderBy(asc(stockCountLine.position));

			expect(lines).toHaveLength(48);

			const countedByItem = new Map(VARYING.map((v) => [ids.get(v.name) as string, v.counted]));
			const skip = ids.get(NOT_YET) as string;

			for (const line of lines) {
				if (line.itemId === skip) continue;
				const varied = countedByItem.get(line.itemId);
				// A matching line is counted at exactly what was snapshotted, which is what makes
				// the 42 real work rather than 42 rows nobody touched.
				await saveCountLine(
					tx,
					line.id,
					varied !== undefined ? units(varied) : Number(line.expected),
					t.userId
				);
			}
		});

		// ── THE FIRST ACCEPTANCE CRITERION, CHECKED BY LOOKING ──────────────────────────
		// Forty-seven quantities have been recorded. Not one of them has reached the ledger.
		expect(await levelSnapshot(t)).toBe(before);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const review = await reviewCount(tx, countId);

			expect(review.counted).toBe(47);
			expect(review.total).toBe(48);
			expect(review.changes).toBe(5);
			// An uncounted line is NOT a change, and every line that IS a change has a cost — so
			// the review step never has to say "we don't know what that's worth" about this count.
			expect(review.uncosted).toBe(0);
			expect(formatZar(review.net)).toBe(nb('-R8 000,00'));
		});

		// Still nothing. Reviewing is a read.
		expect(await levelSnapshot(t)).toBe(before);

		const applied = await runScoped(t.businessId, t.userId, (tx) =>
			applyCount(tx, t.businessId, countId, t.userId)
		);

		// ── ONE MOVEMENT PER VARYING LINE, AND NOT ONE MORE ─────────────────────────────
		expect(applied.movements).toBe(5);
		expect(formatZar(applied.net)).toBe(nb('-R8 000,00'));

		const after = await levelSnapshot(t);
		expect(after).not.toBe(before);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const { rows } = await tx.execute<{ n: number }>(
				sql`select count(*)::int as n from inventory_movement where reason = 'stock_count'`
			);
			expect(rows[0].n).toBe(5);

			// The oak really is at 14 now, in the place it was counted in.
			const { rows: oak } = await tx.execute<{ qty_e6: string }>(
				sql`select qty_e6::text as qty_e6 from inventory_level
				     where item_id = ${ids.get('European oak, 40mm board') as string}`
			);
			expect(Number(oak[0].qty_e6)).toBe(units(14));
		});

		// ── APPLIED IS TERMINAL ─────────────────────────────────────────────────────────
		const refusal = await messageFromRejection(
			runScoped(t.businessId, t.userId, (tx) => applyCount(tx, t.businessId, countId, t.userId))
		);
		expect(refusal).toMatch(/already been applied/i);

		// And the second attempt wrote nothing on its way to being refused.
		expect(await levelSnapshot(t)).toBe(after);
	}, 60_000);

	/**
	 * THE SCREEN'S ORDERING, AGAINST THE SAME ROWS. `triageCount` is what puts the design's "6
	 * are different" at the top of the sheet, and it is asserted here — rather than only in the
	 * pure tests — because the thing being checked is that the row shape the query returns feeds
	 * it correctly. A triage that silently received `counted: undefined` instead of `null` would
	 * pass every unit test and put forty-eight rows at the top of the table.
	 */
	it('puts the five variances and the one unvisited shelf at the top of the sheet', async () => {
		const t = await tenant();
		const ids = await sheetOf48(t);

		const countId = await runScoped(t.businessId, t.userId, (tx) =>
			prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
		);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const rows = await loadStockCountLines(tx, countId);
			const countedByItem = new Map(VARYING.map((v) => [ids.get(v.name) as string, v.counted]));
			const skip = ids.get(NOT_YET) as string;

			for (const row of rows) {
				if (row.itemId === skip) continue;
				const varied = countedByItem.get(row.itemId);
				await saveCountLine(
					tx,
					row.id,
					varied !== undefined ? units(varied) : row.expected.e6,
					t.userId
				);
			}

			const sheet: CountSheetRow[] = (await loadStockCountLines(tx, countId)).map((row) => ({
				line: {
					id: row.id,
					itemId: row.itemId,
					locationId: row.locationId,
					expected: row.expected,
					counted: row.counted,
					costPrice: row.costPrice
				},
				itemName: row.itemName,
				locationName: row.locationName,
				unit: 'each'
			}));

			const { differing, matched } = triageCount(sheet);

			expect(matched).toHaveLength(42);
			expect(differing).toHaveLength(6);
			// Biggest money first, and the shelf nobody reached last.
			// Ordered by what each difference is WORTH, biggest first — R7 120, R1 300, R1 260,
			// R1 200, R480 — and the shelf nobody reached brings up the rear.
			expect(differing.map((r) => r.itemName)).toEqual([
				'European oak, 40mm board',
				'Sash clamp, 900mm',
				'Danish oil, 5L',
				'Birch ply, 18mm sheet',
				'Brass countersunk screws, 4x40',
				NOT_YET
			]);
			expect(differing.map((r) => r.state)).toEqual([
				'varies',
				'varies',
				'varies',
				'varies',
				'varies',
				'not-yet'
			]);
		});
	}, 60_000);
});

describe('"not yet" and a counted zero are different facts', () => {
	async function oneItemCount(t: Seeded, qty: number) {
		await runScoped(t.businessId, t.userId, (tx) =>
			addItem(t, tx, 'Danish oil, 5L', rand(420), qty)
		);
		return runScoped(t.businessId, t.userId, (tx) =>
			prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
		);
	}

	async function onlyLine(t: Seeded, countId: string) {
		return runScoped(t.businessId, t.userId, async (tx) => {
			const [line] = await tx
				.select({ id: stockCountLine.id })
				.from(stockCountLine)
				.where(eq(stockCountLine.stockCountId, countId));
			return line.id;
		});
	}

	/** An empty shelf is a finding worth R5 040. Somebody went and looked. */
	it('treats a counted zero as a variance', async () => {
		const t = await tenant();
		const countId = await oneItemCount(t, 12);
		const lineId = await onlyLine(t, countId);

		await runScoped(t.businessId, t.userId, async (tx) => {
			await saveCountLine(tx, lineId, 0, t.userId);

			const review = await reviewCount(tx, countId);
			expect(review.counted).toBe(1);
			expect(review.changes).toBe(1);
			expect(formatZar(review.net)).toBe(nb('-R5 040,00'));
		});
	});

	/** An empty row on a clipboard is not. Nobody has been there. */
	it('treats an uncounted line as no finding at all', async () => {
		const t = await tenant();
		const countId = await oneItemCount(t, 12);

		await runScoped(t.businessId, t.userId, async (tx) => {
			const review = await reviewCount(tx, countId);
			expect(review.counted).toBe(0);
			expect(review.changes).toBe(0);
			expect(review.net.cents).toBe(0);
		});
	});

	/**
	 * AND THE ROUND TRIP BACK. "Actually, I have not looked at this one yet" has to be reachable
	 * from a typed zero, or the only way out of a mistake is a different mistake.
	 */
	it('lets a counted zero become "not yet" again', async () => {
		const t = await tenant();
		const countId = await oneItemCount(t, 12);
		const lineId = await onlyLine(t, countId);

		await runScoped(t.businessId, t.userId, async (tx) => {
			await saveCountLine(tx, lineId, 0, t.userId);
			await saveCountLine(tx, lineId, null, t.userId);

			const review = await reviewCount(tx, countId);
			expect(review.counted).toBe(0);
			expect(review.changes).toBe(0);

			// The timestamp goes with it. A line cannot claim a quantity nobody can date, and it
			// must not keep a date for a quantity it no longer has either.
			const [row] = await tx
				.select({ counted: stockCountLine.countedQtyE6, at: stockCountLine.countedAt })
				.from(stockCountLine)
				.where(eq(stockCountLine.id, lineId));
			expect(row.counted).toBeNull();
			expect(row.at).toBeNull();
		});
	});

	it('refuses a negative count, because nobody counts minus four onto a shelf', async () => {
		const t = await tenant();
		const countId = await oneItemCount(t, 12);
		const lineId = await onlyLine(t, countId);

		const message = await messageFromRejection(
			runScoped(t.businessId, t.userId, (tx) => saveCountLine(tx, lineId, units(-4), t.userId))
		);
		expect(message).toMatch(/negative/i);
	});
});

/**
 * THE DOOR BETWEEN STEP 2 AND STEP 3.
 *
 * `beginReview` and `resumeCounting` carry no data and change no quantity, which is exactly why
 * they are worth testing: they are the cheapest thing in the flow to "simplify" away, and they
 * are the whole of the mechanism behind the sentence printed on the screen. Nothing commits until
 * step 3 because `applyCount` is only ever handed a count that `beginReview` moved — and that is
 * a statement about ONE column, so it is provable one transition at a time.
 *
 * The illegal moves matter more than the legal ones. A guard nobody tries to walk past is a guard
 * nobody knows is missing.
 */
describe('the door between counting and reviewing', () => {
	/** One item, one line, prepared and sitting at `counting`. Enough for a status test. */
	async function preparedCount(t: Seeded): Promise<string> {
		await runScoped(t.businessId, t.userId, (tx) =>
			addItem(t, tx, 'Danish oil, 5L', rand(420), 12)
		);
		return runScoped(t.businessId, t.userId, (tx) =>
			prepareCount(tx, t.businessId, t.userId, { start: '2026-07-01', end: '2026-07-31' })
		);
	}

	/** Read back through the same loader the routes use, not through a hand-written select. */
	async function statusOf(t: Seeded, countId: string): Promise<string> {
		return runScoped(t.businessId, t.userId, async (tx) => {
			const header = await loadStockCount(tx, countId);
			return header?.status ?? 'no such count';
		});
	}

	/**
	 * A header stranded at `preparing`.
	 *
	 * `prepareCount` inserts at `preparing` and flips to `counting` inside one transaction, so a
	 * row still sitting there is the wreckage of a rolled-back attempt — real enough to reach the
	 * screen, and impossible to produce through the module. Hence the hand-written insert: the
	 * state under test cannot be arrived at any other way.
	 */
	async function strandedAtPreparing(t: Seeded): Promise<string> {
		const countId = randomUUID();
		await runScoped(t.businessId, t.userId, (tx) =>
			tx.insert(stockCount).values({
				id: countId,
				businessId: t.businessId,
				numberPrefix: 'SC-',
				numberValue: 9001,
				numberFormatted: 'SC-9001',
				periodStart: '2026-07-01',
				periodEnd: '2026-07-31',
				status: 'preparing',
				startedByUserId: t.userId
			})
		);
		return countId;
	}

	it('moves a count to reviewing and back again', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);
		expect(await statusOf(t, countId)).toBe('counting');

		await runScoped(t.businessId, t.userId, (tx) => beginReview(tx, countId));
		expect(await statusOf(t, countId)).toBe('reviewing');

		// "Going back for another look, which is the whole point of a last point of return."
		await runScoped(t.businessId, t.userId, (tx) => resumeCounting(tx, countId));
		expect(await statusOf(t, countId)).toBe('counting');
	}, 60_000);

	/**
	 * A double-submit, a back button, a slow connection somebody tapped twice. All of them arrive
	 * as "move to the state you are already in", and answering that with an error would be the
	 * interface complaining about its own latency.
	 */
	it('treats "already there" as done, not as a failure', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);

		await runScoped(t.businessId, t.userId, (tx) => beginReview(tx, countId));
		await runScoped(t.businessId, t.userId, (tx) => beginReview(tx, countId));
		expect(await statusOf(t, countId)).toBe('reviewing');

		await runScoped(t.businessId, t.userId, (tx) => resumeCounting(tx, countId));
		await runScoped(t.businessId, t.userId, (tx) => resumeCounting(tx, countId));
		expect(await statusOf(t, countId)).toBe('counting');
	}, 60_000);

	/**
	 * APPLIED IS TERMINAL, AND BOTH DOORS ARE SHUT.
	 *
	 * This is the one that would let stock be counted twice. Reopening an applied count would put
	 * a sheet whose movements are already in the ledger back in front of somebody to re-apply,
	 * and the second apply would post every variance a second time.
	 */
	it('refuses to reopen a count that has been applied', async () => {
		const t = await tenant();
		const countId = await preparedCount(t);

		await runScoped(t.businessId, t.userId, (tx) => beginReview(tx, countId));
		await runScoped(t.businessId, t.userId, (tx) =>
			applyCount(tx, t.businessId, countId, t.userId)
		);
		expect(await statusOf(t, countId)).toBe('applied');

		expect(
			await messageFromRejection(
				runScoped(t.businessId, t.userId, (tx) => beginReview(tx, countId))
			)
		).toMatch(/already been applied/i);

		expect(
			await messageFromRejection(
				runScoped(t.businessId, t.userId, (tx) => resumeCounting(tx, countId))
			)
		).toMatch(/already been applied/i);

		// And neither refusal moved it on its way out.
		expect(await statusOf(t, countId)).toBe('applied');
	}, 60_000);

	/** A count still being prepared has no sheet to review and nothing to go back to. */
	it('refuses both moves from preparing', async () => {
		const t = await tenant();
		const countId = await strandedAtPreparing(t);

		expect(
			await messageFromRejection(
				runScoped(t.businessId, t.userId, (tx) => beginReview(tx, countId))
			)
		).toMatch(/not at the step/i);

		expect(
			await messageFromRejection(
				runScoped(t.businessId, t.userId, (tx) => resumeCounting(tx, countId))
			)
		).toMatch(/not at the step/i);

		expect(await statusOf(t, countId)).toBe('preparing');
	}, 60_000);

	/** RLS has already made "another business's count" and "no such count" the same answer. */
	it('refuses a count it cannot see', async () => {
		const t = await tenant();

		expect(
			await messageFromRejection(
				runScoped(t.businessId, t.userId, (tx) => beginReview(tx, randomUUID()))
			)
		).toMatch(/couldn't find that stock count/i);
	}, 60_000);
});

/**
 * TWO CLICKS ARE ONE COUNT.
 *
 * The entry point's invariant, and the reason `resumeOrPrepareCount` exists rather than three
 * lines in a form action: "is there an open count?" followed by "then make one" is a check and an
 * act, and two requests run them in two transactions that cannot see each other's uncommitted
 * INSERT. Both answer "no", both prepare, and the business ends up with two live counts, two
 * burnt `SC-` numbers, and a sheet of lines behind Home's resume card, which shows exactly one.
 *
 * THIS TEST CONTENDS FOR REAL. Two `runScoped` calls under one `Promise.all` take two connections
 * out of the pool and interleave inside Postgres — there is no mock here and no fake clock. It
 * runs a few rounds, each on a fresh business, because a race proved once is a race that might
 * have got lucky.
 */
describe('starting a count twice at once', () => {
	it('hands both racing clicks the same count', async () => {
		const period = { start: '2026-07-01', end: '2026-07-31' } as const;

		for (let round = 0; round < 4; round++) {
			const t = await tenant();
			await runScoped(t.businessId, t.userId, (tx) =>
				addItem(t, tx, 'Danish oil, 5L', rand(420), 12)
			);

			const [first, second] = await Promise.all([
				runScoped(t.businessId, t.userId, (tx) =>
					resumeOrPrepareCount(tx, t.businessId, t.userId, period)
				),
				runScoped(t.businessId, t.userId, (tx) =>
					resumeOrPrepareCount(tx, t.businessId, t.userId, period)
				)
			]);

			// The second click wanted the count the first one started. It got it.
			expect(second).toBe(first);

			const headers = await runScoped(t.businessId, t.userId, (tx) =>
				tx.select({ id: stockCount.id }).from(stockCount)
			);
			expect(headers.map((h) => h.id)).toEqual([first]);
		}
	}, 120_000);

	/** And a click on a business that already has one open never prepares at all. */
	it('resumes an open count rather than starting a second', async () => {
		const t = await tenant();
		await runScoped(t.businessId, t.userId, (tx) =>
			addItem(t, tx, 'Danish oil, 5L', rand(420), 12)
		);
		const period = { start: '2026-07-01', end: '2026-07-31' } as const;

		const first = await runScoped(t.businessId, t.userId, (tx) =>
			resumeOrPrepareCount(tx, t.businessId, t.userId, period)
		);

		// Mid-review counts as open too — a count being read at step 3 is still somebody's.
		await runScoped(t.businessId, t.userId, (tx) => beginReview(tx, first));

		const again = await runScoped(t.businessId, t.userId, (tx) =>
			resumeOrPrepareCount(tx, t.businessId, t.userId, period)
		);
		expect(again).toBe(first);

		// An APPLIED count is finished, so the next click genuinely starts a new sheet.
		await runScoped(t.businessId, t.userId, (tx) => applyCount(tx, t.businessId, first, t.userId));
		const fresh = await runScoped(t.businessId, t.userId, (tx) =>
			resumeOrPrepareCount(tx, t.businessId, t.userId, period)
		);
		expect(fresh).not.toBe(first);
	}, 60_000);
});
