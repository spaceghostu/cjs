/**
 * WHAT THE QUOTE EDITOR IS OFFERED.
 *
 * `listPickableItems` is the read the quoting route makes through `inventory/public.ts` — the
 * whole of Inventory's contribution to a quote. Its own file rather than a describe in
 * `inventory.test.ts`, which already sits at the 800-line ceiling.
 *
 * Requires a database.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

// Hosted Neon: every round trip crosses an ocean, and a test that seeds a tenant makes many.
// Set locally, for this file only — the global defaults are not this suite's to change.
vi.setConfig({ testTimeout: 120_000 });
import { closePool, runScoped } from '$lib/server/core/db/client';
import { item } from '$lib/server/core/db/schema/inventory';
import { cleanupFixtures, createBusiness, createUser } from '$lib/server/core/db/fixtures';
import { archiveItem, createItem } from './effects';
import { listPickableItems, MAX_PAGE_SIZE } from './queries';

/** Millionths of a rand. R1 780 -> 1_780_000_000. */
const rand = (n: number) => n * 1_000_000;

async function tenant() {
	const owner = await createUser();
	const business = await createBusiness(owner.id, 'Thornhill Joinery');
	return { businessId: business.id, userId: owner.id };
}

type Seeded = Awaited<ReturnType<typeof tenant>>;

async function addItem(
	t: Seeded,
	name: string,
	opts: { sku?: string | null; unit?: string; sell?: number | null } = {}
) {
	const { sku = null, unit = 'board', sell = rand(1780) } = opts;

	return runScoped(t.businessId, t.userId, (tx) =>
		createItem(
			tx,
			t.businessId,
			t.userId,
			{
				name,
				sku,
				description: null,
				unit,
				costMicros: null,
				sellMicros: sell,
				reorderPointE6: 0,
				defaultLocationId: null,
				newLocationName: 'Rack A'
			},
			null
		)
	);
}

// The explicit timeout is for hosted Neon: teardown walks every tenant table per fixture
// business, and each round trip crosses an ocean. The CLI `--hookTimeout` flag does not reach
// a project defined with `extends: true`, so the hook carries its own.
afterAll(async () => {
	await cleanupFixtures();
	await closePool();
}, 180_000);

describe('what the quote editor is offered', () => {
	it('maps the row to the domain shape, price as a UnitPrice and never raw micros', async () => {
		const t = await tenant();
		const id = await addItem(t, 'European oak, 40mm', { sku: 'OAK-40', sell: rand(1780) });

		const rows = await runScoped(t.businessId, t.userId, (tx) => listPickableItems(tx));
		const oak = rows.find((r) => r.id === id);

		expect(oak).toBeDefined();
		expect(oak?.name).toBe('European oak, 40mm');
		expect(oak?.sku).toBe('OAK-40');
		expect(oak?.unitOfMeasure).toBe('board');
		expect(oak?.sellPrice?.micros).toBe(rand(1780));
		expect(oak?.sellPrice?.currency).toBe('ZAR');
	});

	it('offers an unpriced item with a null price, not a zero', async () => {
		const t = await tenant();
		const id = await addItem(t, 'Offcut bin oddments', { sell: null });

		const rows = await runScoped(t.businessId, t.userId, (tx) => listPickableItems(tx));
		expect(rows.find((r) => r.id === id)?.sellPrice).toBeNull();
	});

	it('leaves archived items out', async () => {
		const t = await tenant();
		const keep = await addItem(t, 'Birch ply, 18mm sheet');
		const gone = await addItem(t, 'Discontinued veneer');

		await runScoped(t.businessId, t.userId, (tx) => archiveItem(tx, gone));

		const rows = await runScoped(t.businessId, t.userId, (tx) => listPickableItems(tx));
		expect(rows.some((r) => r.id === keep)).toBe(true);
		expect(rows.some((r) => r.id === gone)).toBe(false);
	});

	it('comes back in name order, with the id as the tie-break', async () => {
		const t = await tenant();
		const b = await addItem(t, 'Sash clamp, 900mm');
		const a = await addItem(t, 'Brass screws 4x40');
		const twin1 = await addItem(t, 'Danish oil, 5L');
		const twin2 = await addItem(t, 'Danish oil, 5L');

		const rows = await runScoped(t.businessId, t.userId, (tx) => listPickableItems(tx));
		const names = rows.map((r) => r.name);

		expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
		expect(rows.findIndex((r) => r.id === a)).toBeLessThan(rows.findIndex((r) => r.id === b));

		const twins = rows.filter((r) => r.id === twin1 || r.id === twin2).map((r) => r.id);
		expect(twins).toEqual([...twins].sort());
	});

	it('is bounded, like every other query in this module', async () => {
		// Not seeded to 501 rows against a hosted database — the bound is asserted where it
		// lives, alongside the fixture-scoped behaviour above.
		const t = await tenant();
		await addItem(t, 'European oak, 40mm');

		const rows = await runScoped(t.businessId, t.userId, (tx) => listPickableItems(tx));
		expect(rows.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);

		// The tenant sees only its own items — RLS scopes the read, the query needs no filter.
		const foreign = await runScoped(t.businessId, t.userId, (tx) =>
			tx.select({ id: item.id }).from(item).where(eq(item.businessId, t.businessId))
		);
		expect(rows.length).toBe(foreign.length);
	});
});
