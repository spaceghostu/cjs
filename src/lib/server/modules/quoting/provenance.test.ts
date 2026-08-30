/**
 * QUOTE LINES DRAWN FROM INVENTORY, AGAINST A REAL DATABASE.
 *
 * SPA-10's one hard acceptance criterion, stated as tests:
 *
 *   "Quantity on hand is identical before and after a quote is written, sent, accepted,
 *    declined or expired — and a test must prove it."
 *
 * A quote line's link to stock is PROVENANCE, never a reservation. The movement ledger for
 * the picked item must not gain a row at any transition, the line's snapshotted price must
 * survive a repricing of the item, and the quote must keep rendering after the business
 * archives the item or removes the Inventory module entirely.
 *
 * The inventory fixtures are built by direct schema inserts rather than through
 * `inventory/effects` — ESLint zone 3 bars a quoting file, tests included, from importing
 * another module's internals, and the core schema is the unrestricted floor both stand on.
 *
 * Requires a database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, count, eq, sql } from 'drizzle-orm';

// Hosted Neon: a full quote lifecycle is dozens of round trips, each crossing an ocean.
// Set locally, for this file only — the global defaults are not this suite's to change.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

/**
 * The mail transport, under our control — `sendQuote` mails INSIDE its transaction, so the
 * mock must be in place before anything below imports it. Same shape as `sharing.test.ts`.
 */
const mail = vi.hoisted(() => ({
	sent: [] as { to: string; subject: string; text: string }[]
}));

vi.mock('$lib/server/core/mail', () => ({
	sendMail: vi.fn(async (message: (typeof mail.sent)[number]) => {
		mail.sent.push(message);
	})
}));

const { closePool, runScoped } = await import('$lib/server/core/db/client');
const { item, location, movement } = await import('$lib/server/core/db/schema/inventory');
const { subscription } = await import('$lib/server/core/db/schema/billing');
const { business: businessTable } = await import('$lib/server/core/db/schema/core');
const { toBusiness } = await import('$lib/server/core/db/map');
const { loadAccess } = await import('$lib/server/core/entitlement');
const { priceQuote } = await import('$lib/core/quoting');
const { createDraft, saveDraft, sweepExpired } = await import('./effects');
const { sendQuote } = await import('./send');
const { answerSharedQuote } = await import('./accept');
const { loadQuote, loadQuoteRow } = await import('./queries');
const fixtures = await import('$lib/server/core/db/fixtures');

type TestUser = Awaited<ReturnType<typeof fixtures.createUser>>;
type TestBusiness = Awaited<ReturnType<typeof fixtures.createBusiness>>;

let owner: TestUser;
let thornhill: TestBusiness;
let customerId: string;
let rackId: string;
let oakId: string;

const OAK_SELL_MICROS = 1_780_000_000;
const OPENING_QTY_E6 = 40_000_000;

beforeAll(async () => {
	owner = await fixtures.createUser('Alice Thornhill');
	thornhill = await fixtures.createBusiness(owner.id, 'Thornhill Joinery');
	customerId = await fixtures.createCustomer(thornhill, 'Fynbos Interiors');

	rackId = crypto.randomUUID();
	oakId = crypto.randomUUID();

	// The stocked item the picker would offer: 40 boards of oak on Rack A, at R1 780 a board.
	await runScoped(thornhill.id, owner.id, async (tx) => {
		await tx.insert(location).values({ id: rackId, businessId: thornhill.id, name: 'Rack A' });
		await tx.insert(item).values({
			id: oakId,
			businessId: thornhill.id,
			name: 'European oak, 40mm',
			unit: 'board',
			sellMicros: OAK_SELL_MICROS
		});
		await tx.insert(movement).values({
			businessId: thornhill.id,
			itemId: oakId,
			locationId: rackId,
			qtyE6: OPENING_QTY_E6,
			reason: 'opening',
			occurredOn: '2026-08-01'
		});
	});
});

afterAll(async () => {
	await fixtures.cleanupFixtures();
	await closePool();
});

/**
 * The ledger's answer for THIS item — a COUNT as well as a sum, because a +5/−5 pair sums
 * to zero and would slip past a sum alone. Never a table-wide count: the shared preview
 * database holds other tenants' wreckage.
 */
async function oakLedger(): Promise<{ rows: number; qtyE6: number }> {
	return runScoped(thornhill.id, owner.id, async (tx) => {
		const [row] = await tx
			.select({
				rows: count(),
				qtyE6: sql<string>`coalesce(sum(${movement.qtyE6}), 0)`
			})
			.from(movement)
			.where(eq(movement.itemId, oakId));
		return { rows: row.rows, qtyE6: Number(row.qtyE6) };
	});
}

async function expectNothingMoved(): Promise<void> {
	const ledger = await oakLedger();
	expect(ledger.rows).toBe(1); // the opening, and only ever the opening
	expect(ledger.qtyE6).toBe(OPENING_QTY_E6);
}

/** A draft whose one line was picked from Inventory — the payload `lineFromItem` produces. */
async function draftWithPickedLine(validUntil = '2099-12-31'): Promise<string> {
	return runScoped(thornhill.id, owner.id, async (tx) => {
		const [row] = await tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, thornhill.id));

		const id = await createDraft(tx, toBusiness(row), { customerId });

		await saveDraft(tx, thornhill.id, id, {
			customerId,
			customer: {
				name: 'Fynbos Interiors',
				contactPerson: null,
				email: 'renske@fynbosinteriors.co.za',
				phone: null,
				vatNumber: null,
				addressLine1: null,
				addressLine2: null,
				city: null,
				postalCode: null
			},
			sendToName: 'Renske Malan',
			sendToEmail: 'renske@fynbosinteriors.co.za',
			validUntil,
			deposit: { kind: 'none' },
			lines: [
				{
					id: crypto.randomUUID(),
					position: 0,
					description: 'European oak, 40mm',
					provenance: 'From Inventory · European oak, 40mm · per board',
					documentDescription: null,
					qtyE6: 4_000_000,
					unitPriceMicros: OAK_SELL_MICROS,
					taxTreatment: 'standard',
					sourceItemId: oakId
				}
			]
		});

		return id;
	});
}

function send(quoteId: string) {
	return runScoped(thornhill.id, owner.id, (tx) =>
		sendQuote(tx, thornhill.id, owner.id, quoteId, 'https://cjs.test')
	);
}

describe('nothing moves at any quote transition', () => {
	it('written, sent and accepted — the ledger never gains a row', async () => {
		const id = await draftWithPickedLine();
		await expectNothingMoved();

		const { token } = await send(id);
		await expectNothingMoved();

		const answer = await answerSharedQuote(token, 'accepted', { name: 'Renske Malan' });
		expect(answer.ok).toBe(true);
		await expectNothingMoved();

		// Acceptance DOES create a job and link it back (SPA-20) — expected collateral, pinned
		// here so a future reader cannot mistake "nothing moves" for "nothing happens".
		const row = await runScoped(thornhill.id, owner.id, (tx) => loadQuoteRow(tx, id));
		expect(row?.jobId).not.toBeNull();
	});

	it('declined — same answer', async () => {
		const id = await draftWithPickedLine();
		const { token } = await send(id);

		const answer = await answerSharedQuote(token, 'declined', { reason: 'Went another way.' });
		expect(answer.ok).toBe(true);
		await expectNothingMoved();
	});

	it('expired by the sweep — same answer', async () => {
		const id = await draftWithPickedLine('2020-01-01');
		await send(id);

		await runScoped(thornhill.id, owner.id, async (tx) => {
			await sweepExpired(tx);
			const quote = await loadQuote(tx, id);
			expect(quote?.status).toBe('expired');
		});

		await expectNothingMoved();
	});
});

describe('the snapshot, diverging from the catalogue', () => {
	it('keeps the picked price after the item is repriced', async () => {
		const id = await draftWithPickedLine();
		const before = await runScoped(thornhill.id, owner.id, (tx) => loadQuote(tx, id));

		// Somebody repricing the oak, weeks later.
		await runScoped(thornhill.id, owner.id, (tx) =>
			tx.update(item).set({ sellMicros: 2_050_000_000 }).where(eq(item.id, oakId))
		);

		const after = await runScoped(thornhill.id, owner.id, (tx) => loadQuote(tx, id));
		expect(after?.lines[0].unitPrice.micros).toBe(OAK_SELL_MICROS);
		expect(after?.lines[0].sourceItemId).toBe(oakId);
		expect(priceQuote(after!).total.cents).toBe(priceQuote(before!).total.cents);

		// Put the catalogue back — later tests read the same item.
		await runScoped(thornhill.id, owner.id, (tx) =>
			tx.update(item).set({ sellMicros: OAK_SELL_MICROS }).where(eq(item.id, oakId))
		);
	});
});

describe('a quote authored while entitled keeps rendering', () => {
	it('after the item itself is archived', async () => {
		const id = await draftWithPickedLine();
		const before = await runScoped(thornhill.id, owner.id, (tx) => loadQuote(tx, id));

		await runScoped(thornhill.id, owner.id, (tx) =>
			tx.update(item).set({ archivedAt: new Date() }).where(eq(item.id, oakId))
		);

		// `loadQuote` selects from the quote's own tables and never joins inventory, so the
		// line and its price are untouched by the archive.
		const after = await runScoped(thornhill.id, owner.id, (tx) => loadQuote(tx, id));
		expect(after?.lines[0].description).toBe('European oak, 40mm');
		expect(after?.lines[0].unitPrice.micros).toBe(OAK_SELL_MICROS);
		expect(priceQuote(after!).total.cents).toBe(priceQuote(before!).total.cents);

		await runScoped(thornhill.id, owner.id, (tx) =>
			tx.update(item).set({ archivedAt: null }).where(eq(item.id, oakId))
		);
	});

	it('after the Inventory module is removed — the ticket, word for word', async () => {
		// Fixtures seed no subscriptions, so build the entitlement this leg then removes.
		await runScoped(thornhill.id, owner.id, (tx) =>
			tx.insert(subscription).values({
				businessId: thornhill.id,
				moduleKey: 'inventory',
				startedAt: new Date('2026-07-01T00:00:00Z'),
				priceCents: 9900
			})
		);

		const owned = await runScoped(thornhill.id, owner.id, (tx) => loadAccess(tx));
		expect(owned.inventory).toBe('write');

		const id = await draftWithPickedLine();
		const before = await runScoped(thornhill.id, owner.id, (tx) => loadQuote(tx, id));

		// The removal: the open period closes, and access drops to read-only.
		await runScoped(thornhill.id, owner.id, (tx) =>
			tx
				.update(subscription)
				.set({ endedAt: new Date() })
				.where(
					and(eq(subscription.businessId, thornhill.id), eq(subscription.moduleKey, 'inventory'))
				)
		);

		const removed = await runScoped(thornhill.id, owner.id, (tx) => loadAccess(tx));
		expect(removed.inventory).toBe('read');

		// The quote is exactly what it was: same line, same provenance text, same total.
		const after = await runScoped(thornhill.id, owner.id, (tx) => loadQuote(tx, id));
		expect(after?.lines[0].description).toBe(before?.lines[0].description);
		expect(after?.lines[0].provenance).toBe('From Inventory · European oak, 40mm · per board');
		expect(after?.lines[0].unitPrice.micros).toBe(OAK_SELL_MICROS);
		expect(priceQuote(after!).total.cents).toBe(priceQuote(before!).total.cents);
	});
});
