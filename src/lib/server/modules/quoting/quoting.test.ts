/**
 * QUOTING, AGAINST A REAL DATABASE.
 *
 * T15's acceptance criteria, one describe block each. Every one of them is about something
 * that is invisible until it is catastrophic: two clients holding the same quote number, a
 * quote that re-priced itself because somebody edited a stock item, a customer record quietly
 * rewritten by a typo on one document.
 *
 * These run against a real Postgres because every guarantee under test is one Postgres makes.
 * A fake with no row locks would pass the concurrency test while proving nothing.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { priceQuote } from '$lib/core/quoting';
import { money, percent, quantity, unitPrice } from '$lib/core/money/ctor';
import { formatZar, VAT_POLICY, ZAR, type Money } from '$lib/core/money';
import { closePool, runScoped } from '$lib/server/core/db/client';
import { allocateDocumentNumber } from '$lib/server/core/db/numbering';
import {
	cleanupFixtures,
	createBusiness,
	createCustomer,
	createUser,
	messageFromRejection,
	type TestBusiness,
	type TestUser
} from '$lib/server/core/db/fixtures';
import { quote, quoteLine } from '$lib/server/core/db/schema/quoting';
import { customer as customerTable } from '$lib/server/core/db/schema/core';
import { toBusiness, type Business } from '$lib/server/core/db/map';
import type { Tx } from '$lib/server/core/db/tx';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { createDraft, promoteCustomerFields, saveDraft } from './effects';
import { loadQuote } from './queries';
import type { DraftPatch, LinePatch } from '$lib/core/quoting/wire';

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

let owner: TestUser;
let thornhill: TestBusiness;
let customerId: string;

beforeAll(async () => {
	owner = await createUser('Alice Thornhill');
	thornhill = await createBusiness(owner.id, 'Thornhill Joinery');
	customerId = await createCustomer(thornhill, 'Fynbos Interiors');

	// A VAT number, so the tax engine is `za_vat` rather than `none`. The design's worked
	// example charges VAT, which a business with no registration must not.
	await runScoped(thornhill.id, owner.id, (tx) =>
		tx
			.update(businessTable)
			.set({ vatNumber: '4890271563', phone: '021 447 2210', addressLine1: '14 Sir Lowry Road' })
			.where(eq(businessTable.businessId, thornhill.id))
	);
});

/**
 * `formatZar` with its non-breaking spaces made visible.
 *
 * The separator is U+00A0 on purpose — "R1 234,56" must never wrap mid-number across a table
 * cell or a printed line. Asserting against a literal typed with an ordinary space produces
 * the worst failure message in testing: `expected 'R42 400,00' to be 'R42 400,00'`.
 */
function rands(m: Money): string {
	return formatZar(m).replaceAll('\u00a0', ' ');
}

/**
 * The business row, by id.
 *
 * NOT `select().from(business)` with a `[row]` destructure. `member_sees_own_business` is a
 * SELECT-only policy that lets a person see every business they belong to, so a test user who
 * owns three of them gets three rows back regardless of which one the transaction is scoped
 * to — and the first is whichever Postgres felt like. The `tenant_isolation` policy is doing
 * its job on writes; this is a read that a second policy legitimately widens.
 */
async function loadBusiness(tx: Tx, id: string): Promise<Business> {
	const [row] = await tx.select().from(businessTable).where(eq(businessTable.businessId, id));
	return toBusiness(row);
}

/** Runs `fn` in a transaction scoped to Thornhill, the way a request would. */
function asThornhill<T>(fn: (tx: Tx) => Promise<T>) {
	return runScoped(thornhill.id, owner.id, fn);
}

function line(
	over: Partial<LinePatch> & { description: string; unitPriceMicros: number }
): LinePatch {
	return {
		id: crypto.randomUUID(),
		position: 0,
		provenance: null,
		documentDescription: null,
		qtyE6: 1_000_000,
		taxTreatment: 'standard',
		sourceItemId: null,
		...over
	};
}

function patch(over: Partial<DraftPatch> = {}): DraftPatch {
	return {
		customerId,
		customer: {
			name: 'Fynbos Interiors',
			contactPerson: 'Renske Malan',
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
		validUntil: '2026-08-22',
		deposit: { kind: 'rate', ppm: 500_000 },
		lines: [],
		...over
	};
}

describe('the design worked example', () => {
	/**
	 * 24 800 + 8 600 + 9 000 -> 42 400 -> VAT 6 360 -> 48 760, deposit 24 380.
	 *
	 * Asserted through the WHOLE path — saved as a draft, read back, priced by `priceQuote` —
	 * rather than by calling the money engine directly. `money/price.test.ts` already proves
	 * the arithmetic; this proves that a quote in the database still produces it, which is the
	 * part a column type or a lost decimal place could break.
	 */
	it('reproduces exactly, to the cent, through storage', async () => {
		const business = await asThornhill((tx) => loadBusiness(tx, thornhill.id));

		const id = await asThornhill((tx) => createDraft(tx, business, { customerId }));

		await asThornhill((tx) =>
			saveDraft(
				tx,
				thornhill.id,
				id,
				patch({
					lines: [
						line({
							position: 0,
							description: 'Solid oak kitchen island top',
							unitPriceMicros: 24_800_000_000
						}),
						line({
							position: 1,
							description: 'Base cabinetry, oak veneer',
							unitPriceMicros: 8_600_000_000
						}),
						line({
							position: 2,
							description: 'Installation and finishing',
							unitPriceMicros: 9_000_000_000
						})
					]
				})
			)
		);

		const saved = await asThornhill((tx) => loadQuote(tx, id));
		const price = priceQuote(saved!);

		expect(rands(price.subtotal)).toBe('R42 400,00');
		expect(rands(price.tax)).toBe('R6 360,00');
		expect(rands(price.total)).toBe('R48 760,00');
		expect(rands(price.deposit!)).toBe('R24 380,00');

		// And the totals reconcile — the same claim the database CHECK makes about a snapshot.
		expect(price.subtotal.cents + price.tax.cents).toBe(price.total.cents);
	});

	it('prices a business with no VAT registration under the no-VAT engine', async () => {
		const noVat = await createBusiness(owner.id, 'Kloof Cabinetry');
		const business = await runScoped(noVat.id, owner.id, (tx) => loadBusiness(tx, noVat.id));

		const id = await runScoped(noVat.id, owner.id, (tx) => createDraft(tx, business));
		const loaded = await runScoped(noVat.id, owner.id, (tx) => loadQuote(tx, id));

		// Not a template branch. `priceDocument` under engine 'none' collapses the document
		// into a single no-VAT group, so a non-vendor cannot print a rate — s58(1)(a).
		expect(loaded!.pricing.engine).toBe('none');
	});
});

describe('document numbers', () => {
	/**
	 * The property that matters: `QT-1043` means exactly one document, forever.
	 *
	 * Twelve allocations racing in twelve separate transactions. `INSERT … ON CONFLICT DO
	 * UPDATE … RETURNING` takes a row lock held to commit, so they serialise — and the answer
	 * has to be twelve distinct consecutive numbers, not twelve copies of the first.
	 */
	it('are unique and gapless under concurrent allocation', async () => {
		const racer = await createBusiness(owner.id, 'Concurrent Joinery');

		const results = await Promise.all(
			Array.from({ length: 12 }, () =>
				runScoped(racer.id, owner.id, (tx) => allocateDocumentNumber(tx, 'quote'))
			)
		);

		const values = results.map((r) => r.value).sort((a, b) => a - b);
		expect(new Set(values).size).toBe(12);
		expect(values).toEqual(Array.from({ length: 12 }, (_, i) => 1001 + i));
		expect(results[0].formatted).toMatch(/^QT-10\d\d$/);
	});

	it("are per business — one tenant's counter is not another's", async () => {
		const a = await createBusiness(owner.id, 'Alpha Joinery');
		const b = await createBusiness(owner.id, 'Beta Joinery');

		const first = await runScoped(a.id, owner.id, (tx) => allocateDocumentNumber(tx, 'quote'));
		const second = await runScoped(b.id, owner.id, (tx) => allocateDocumentNumber(tx, 'quote'));

		expect(first.formatted).toBe('QT-1001');
		expect(second.formatted).toBe('QT-1001');
	});

	it('refuses a duplicate number even if one were somehow computed', async () => {
		const dupe = await createBusiness(owner.id, 'Duplicate Joinery');
		const cid = await createCustomer(dupe, 'Somebody');

		const message = await messageFromRejection(
			runScoped(dupe.id, owner.id, async (tx) => {
				for (const attempt of [1, 2]) {
					void attempt;
					await tx.insert(quote).values({
						businessId: dupe.id,
						customerId: cid,
						status: 'sent',
						numberPrefix: 'QT',
						numberValue: 1001,
						numberFormatted: 'QT-1001',
						vatPolicy: VAT_POLICY,
						snapshotSubtotalCents: 0,
						snapshotTaxCents: 0,
						snapshotTotalCents: 0,
						snapshotAt: new Date()
					});
				}
			})
		);

		expect(message).toContain('quoting_quote_number_unique');
	});
});

describe('the inventory snapshot', () => {
	/**
	 * "A quote sent last month must not silently change because someone edited a stock item."
	 *
	 * Inventory does not exist until T23, so the source item is represented by the id the line
	 * remembers. What is under test is the shape that makes the guarantee possible: the line
	 * owns its own description and price, and the link is provenance rather than a lookup.
	 */
	it("keeps the line's own description and price, linked but not derived", async () => {
		const business = await asThornhill((tx) => loadBusiness(tx, thornhill.id));
		const id = await asThornhill((tx) => createDraft(tx, business, { customerId }));
		const sourceItemId = crypto.randomUUID();

		await asThornhill((tx) =>
			saveDraft(
				tx,
				thornhill.id,
				id,
				patch({
					lines: [
						line({
							description: 'European oak, 40mm',
							provenance: 'From Inventory · European oak, 40mm',
							unitPriceMicros: 1_250_000_000,
							sourceItemId
						})
					]
				})
			)
		);

		const [row] = await asThornhill((tx) =>
			tx.select().from(quoteLine).where(eq(quoteLine.quoteId, id))
		);

		expect(row.sourceItemId).toBe(sourceItemId);
		expect(row.unitPriceMicros).toBe(1_250_000_000);
		// The moment the snapshot was taken is recorded, so a later divergence has a date.
		expect(row.sourceCapturedAt).toBeInstanceOf(Date);

		// There is no foreign key to an inventory item, deliberately: a quote has to survive a
		// business removing Inventory entirely.
		const { rows } = await asThornhill((tx) =>
			tx.execute<{ count: string }>(sql`
				select count(*)::text as count
				  from pg_constraint
				 where conrelid = 'quoting_quote_line'::regclass
				   and contype = 'f'
				   and 'source_item_id' = any (
				       select attname from pg_attribute
				        where attrelid = conrelid and attnum = any (conkey))
			`)
		);
		expect(rows[0].count).toBe('0');
	});
});

describe('a customer override', () => {
	it('does not touch core_customer without an explicit act', async () => {
		const business = await asThornhill((tx) => loadBusiness(tx, thornhill.id));
		const id = await asThornhill((tx) => createDraft(tx, business, { customerId }));

		await asThornhill((tx) =>
			saveDraft(
				tx,
				thornhill.id,
				id,
				patch({
					customer: {
						...patch().customer,
						name: 'Fynbos Interiors (Pty) Ltd',
						vatNumber: '4110998877'
					}
				})
			)
		);

		const [record] = await asThornhill((tx) =>
			tx.select().from(customerTable).where(eq(customerTable.id, customerId))
		);

		// The document says one thing; the address book still says what it said.
		expect(record.name).toBe('Fynbos Interiors');
		expect(record.vatNumber).toBeNull();

		const loaded = await asThornhill((tx) => loadQuote(tx, id));
		expect(loaded!.customer.name).toBe('Fynbos Interiors (Pty) Ltd');
	});

	it('travels back only when promoted, and only the named fields', async () => {
		const business = await asThornhill((tx) => loadBusiness(tx, thornhill.id));
		const cid = await createCustomer(thornhill, 'Waterkant Property Group');
		const id = await asThornhill((tx) => createDraft(tx, business, { customerId: cid }));

		await asThornhill((tx) =>
			saveDraft(
				tx,
				thornhill.id,
				id,
				patch({
					customerId: cid,
					customer: {
						...patch().customer,
						name: 'Waterkant Property Group',
						vatNumber: '4220110099',
						city: 'Cape Town'
					}
				})
			)
		);

		await asThornhill((tx) => promoteCustomerFields(tx, id, ['vatNumber']));

		const [record] = await asThornhill((tx) =>
			tx.select().from(customerTable).where(eq(customerTable.id, cid))
		);

		expect(record.vatNumber).toBe('4220110099');
		// Not promoted, not written. Promotion is a closed list, chosen by the person.
		expect(record.city).toBeNull();
	});
});

describe('archival', () => {
	it('removes a line by archiving it, never by deleting it', async () => {
		const business = await asThornhill((tx) => loadBusiness(tx, thornhill.id));
		const id = await asThornhill((tx) => createDraft(tx, business, { customerId }));
		const keep = line({ description: 'Stays', unitPriceMicros: 1_000_000, position: 0 });
		const drop = line({ description: 'Goes', unitPriceMicros: 2_000_000, position: 1 });

		await asThornhill((tx) => saveDraft(tx, thornhill.id, id, patch({ lines: [keep, drop] })));
		await asThornhill((tx) => saveDraft(tx, thornhill.id, id, patch({ lines: [keep] })));

		const loaded = await asThornhill((tx) => loadQuote(tx, id));
		expect(loaded!.lines.map((l) => l.description)).toEqual(['Stays']);

		// Still there, with a date on it. The audit trail of a document is not editable by
		// changing your mind about a line.
		const all = await asThornhill((tx) =>
			tx.select().from(quoteLine).where(eq(quoteLine.quoteId, id))
		);
		expect(all).toHaveLength(2);
		expect(all.find((l) => l.description === 'Goes')!.archivedAt).toBeInstanceOf(Date);
	});

	it('refuses a DELETE outright, at the grant', async () => {
		const message = await messageFromRejection(
			asThornhill((tx) => tx.execute(sql`delete from quoting_quote_line`))
		);
		expect(message).toContain('permission denied');
	});
});

describe('the money the database will hold', () => {
	it('refuses a snapshot whose parts do not sum to its total', async () => {
		const message = await messageFromRejection(
			asThornhill((tx) =>
				tx.insert(quote).values({
					businessId: thornhill.id,
					customerId,
					status: 'sent',
					numberPrefix: 'QT',
					numberValue: 9001,
					numberFormatted: 'QT-9001',
					vatPolicy: VAT_POLICY,
					snapshotSubtotalCents: 4_240_000,
					snapshotTaxCents: 636_000,
					// One cent out. This is the defect class the brief calls unacceptable.
					snapshotTotalCents: 4_876_001,
					snapshotAt: new Date()
				})
			)
		);
		expect(message).toContain('quoting_quote_snapshot_reconciles');
	});

	it('refuses a quote that left draft without a number', async () => {
		const message = await messageFromRejection(
			asThornhill((tx) =>
				tx.insert(quote).values({
					businessId: thornhill.id,
					customerId,
					status: 'sent',
					vatPolicy: VAT_POLICY
				})
			)
		);
		expect(message).toContain('quoting_quote_number_required_once_sent');
	});

	it('refuses deposit terms stated two ways at once', async () => {
		const message = await messageFromRejection(
			asThornhill((tx) =>
				tx.insert(quote).values({
					businessId: thornhill.id,
					customerId,
					vatPolicy: VAT_POLICY,
					depositRatePpm: 500_000,
					depositAmountCents: 100_000
				})
			)
		);
		expect(message).toContain('quoting_quote_deposit_single_form');
	});
});

describe('a sent quote', () => {
	it('cannot be edited', async () => {
		const business = await asThornhill((tx) => loadBusiness(tx, thornhill.id));
		const id = await asThornhill((tx) => createDraft(tx, business, { customerId }));

		await asThornhill((tx) =>
			tx
				.update(quote)
				.set({
					status: 'sent',
					numberPrefix: 'QT',
					numberValue: 9500,
					numberFormatted: 'QT-9500'
				})
				.where(eq(quote.id, id))
		);

		await expect(asThornhill((tx) => saveDraft(tx, thornhill.id, id, patch()))).rejects.toThrow(
			/already been sent/
		);
	});
});

describe('the money types survive the round trip', () => {
	it('reads back exactly what was written, with no float in between', async () => {
		const business = await asThornhill((tx) => loadBusiness(tx, thornhill.id));
		const id = await asThornhill((tx) => createDraft(tx, business, { customerId }));

		// R33,333333 per unit × 3 — the case that loses a cent if a unit price is stored in
		// cents rather than millionths.
		await asThornhill((tx) =>
			saveDraft(
				tx,
				thornhill.id,
				id,
				patch({
					lines: [line({ description: 'Thirds', unitPriceMicros: 33_333_333, qtyE6: 3_000_000 })]
				})
			)
		);

		const loaded = await asThornhill((tx) => loadQuote(tx, id));
		expect(loaded!.lines[0].unitPrice).toEqual(unitPrice(33_333_333, ZAR));
		expect(loaded!.lines[0].qty).toEqual(quantity(3_000_000));
		expect(loaded!.lines[0].vatRate).toEqual(percent(15));
		expect(priceQuote(loaded!).subtotal).toEqual(money(10_000, ZAR));
	});
});
