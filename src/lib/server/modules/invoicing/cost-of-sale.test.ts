/**
 * LABOUR AT WHAT WAS CHARGED — SPA-9, AGAINST A REAL DATABASE.
 *
 * A quote's provenance-less lines are the client's labour (Q5: no rate card, no timesheets), so
 * `createFromQuote` snapshots the charge as their cost under source `charged`. These tests walk
 * the whole distance: the pure classifier, the written snapshot, the postings it becomes, and
 * the panel that reads the postings back — the iron rule being that every figure on the panel
 * is a `core_posting` row, never a display-time computation.
 *
 * Split from `invoicing.test.ts` the way `sharing.test.ts` was: a feature suite with its own
 * fixtures, so the T19 file stays the T19 file.
 *
 * Requires a database: `bun run db:dev`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

// Hosted Neon: issuing an invoice is dozens of round trips, each crossing an ocean. Set
// locally, for this file only — the global defaults are not this suite's to change.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { formatZar, ZAR, type Money } from '$lib/core/money';
import { closePool, runScoped } from '$lib/server/core/db/client';
import {
	cleanupFixtures,
	createBusiness,
	createCustomer,
	createUser,
	messageFromRejection,
	type TestBusiness,
	type TestUser
} from '$lib/server/core/db/fixtures';
import { business as businessTable } from '$lib/server/core/db/schema/core';
import { invoiceLine } from '$lib/server/core/db/schema/invoicing';
import { posting } from '$lib/server/core/db/schema/ledger';
import { toBusiness, type Business } from '$lib/server/core/db/map';
import type { Tx } from '$lib/server/core/db/tx';
import { createFromQuote, duplicateInvoice, saveDraft } from './effects';
import { issueInvoice } from './send';
import { chargedLabourCost } from './ledger';
import { costsCameFromInventory, marginFor } from './margin';
import type { InvoicePatch, LinePatch } from '$lib/core/invoicing/wire';

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

let owner: TestUser;
let thornhill: TestBusiness;
let customerId: string;
let business: Business;

beforeAll(async () => {
	owner = await createUser('Alice Thornhill');
	thornhill = await createBusiness(owner.id, 'Thornhill Joinery');
	customerId = await createCustomer(thornhill, 'Meridian Developments');

	// A VAT number, so the tax engine is `za_vat` and the document is headed TAX INVOICE. The
	// design's worked example charges VAT, which a business with no registration must not.
	await runScoped(thornhill.id, owner.id, (tx) =>
		tx
			.update(businessTable)
			.set({ vatNumber: '4890271563', phone: '021 447 2210', addressLine1: '14 Sir Lowry Road' })
			.where(eq(businessTable.businessId, thornhill.id))
	);

	business = await runScoped(thornhill.id, owner.id, async (tx) => {
		const [row] = await tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, thornhill.id));
		return toBusiness(row);
	});
});

/** Same helper, same reason, as `quoting.test.ts` — `formatZar` uses a non-breaking space. */
function rands(m: Money): string {
	return formatZar(m).replaceAll(' ', ' ');
}

function as<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
	return runScoped(thornhill.id, owner.id, fn);
}

function line(overrides: Partial<LinePatch> = {}): LinePatch {
	return {
		// A fresh id per line, per run. A deterministic sequence looks tidier and is a trap: the
		// save path is `INSERT … ON CONFLICT DO UPDATE`, so an id left behind by a previous run
		// belongs to a previous BUSINESS — and the conflicting update is then refused by
		// `tenant_isolation`, which is the policy doing its job at the worst possible moment.
		id: randomUUID(),
		position: 0,
		description: 'A line',
		provenance: null,
		documentDescription: null,
		qtyE6: 1_000_000,
		unitPriceMicros: 1_000_000_000,
		taxTreatment: 'standard',
		noCharge: false,
		sourceItemId: null,
		...overrides
	};
}

function patch(overrides: Partial<InvoicePatch> = {}): InvoicePatch {
	return {
		customerId,
		customer: {
			name: 'Meridian Developments',
			contactPerson: null,
			email: 'accounts@meridian.co.za',
			phone: null,
			vatNumber: null,
			addressLine1: '9 Buitengracht Street',
			addressLine2: null,
			city: 'Cape Town',
			postalCode: null
		},
		sendToName: null,
		sendToEmail: 'accounts@meridian.co.za',
		dueDate: '2099-08-18',
		lines: [line()],
		...overrides
	};
}

describe('labour costed at what was charged', () => {
	/** A quote line as `createFromQuote` receives one. No `noCharge` — quote lines have none. */
	function quotedLine(
		overrides: Partial<{
			position: number;
			description: string;
			qtyE6: number;
			unitPriceMicros: number;
			sourceItemId: string | null;
		}> = {}
	) {
		return {
			position: 0,
			description: 'A quoted line',
			provenance: null,
			documentDescription: null,
			qtyE6: 1_000_000,
			unitPriceMicros: 1_000_000_000,
			taxTreatment: 'standard',
			vatRatePpm: 150_000,
			sourceItemId: null,
			...overrides
		};
	}

	/** The design's 21 000 shape, all hand-typed: what a quote with no picked lines becomes. */
	function handTypedLines() {
		return [
			quotedLine({
				position: 0,
				description: 'Counter and bar top',
				unitPriceMicros: 16_400_000_000
			}),
			quotedLine({
				position: 1,
				description: 'Shelving unit',
				qtyE6: 2_000_000,
				unitPriceMicros: 2_300_000_000
			}),
			quotedLine({ position: 2, description: 'Fitting and finishing', unitPriceMicros: 0 })
		];
	}

	function fromQuote(lines: ReturnType<typeof quotedLine>[]): Promise<string> {
		return as((tx) =>
			createFromQuote(tx, business, {
				quoteId: randomUUID(),
				quoteNumber: 'QT-9001',
				jobId: null,
				customerId,
				customer: { name: 'Meridian Developments' },
				sendToName: null,
				sendToEmail: 'accounts@meridian.co.za',
				pricingMode: 'exclusive',
				taxEngine: 'za_vat',
				vatRatePpm: 150_000,
				vatPolicy: 'standard',
				currency: 'ZAR',
				lines
			})
		);
	}

	it('classifies a charge as labour cost only where nothing else could know better', () => {
		// Provenance-less: the charge is the labour figure, per unit like `costMicros`.
		expect(chargedLabourCost({ sourceItemId: null, unitPriceMicros: 750_000_000 })).toBe(
			750_000_000
		);
		// Sourced from a stock item: that cost belongs to Inventory, not to the charge.
		expect(chargedLabourCost({ sourceItemId: randomUUID(), unitPriceMicros: 750_000_000 })).toBe(
			null
		);
		// A negative price would be refused by `cost_not_negative`; quote lines carry no sign CHECK.
		expect(chargedLabourCost({ sourceItemId: null, unitPriceMicros: -1 })).toBe(null);
		// Zero is a real recorded cost of nothing, not an unknown.
		expect(chargedLabourCost({ sourceItemId: null, unitPriceMicros: 0 })).toBe(0);
	});

	it('snapshots the charge onto provenance-less lines and leaves picked lines uncosted', async () => {
		const pickedItem = randomUUID();
		const id = await fromQuote([
			quotedLine({ position: 0, description: 'Hand-typed work', unitPriceMicros: 5_000_000_000 }),
			quotedLine({
				position: 1,
				description: 'Oak from the rack',
				unitPriceMicros: 3_000_000_000,
				sourceItemId: pickedItem
			})
		]);

		const rows = await as((tx) =>
			tx
				.select()
				.from(invoiceLine)
				.where(eq(invoiceLine.invoiceId, id))
				.orderBy(invoiceLine.position)
		);

		expect(rows[0].costMicros).toBe(5_000_000_000);
		expect(rows[0].costSource).toBe('charged');
		expect(rows[0].costCapturedAt).not.toBeNull();

		// The picked line stays fully uncosted — all three columns together, as `cost_complete`
		// demands. Its cost is Inventory's to record (SPA-23), and guessing here would be the
		// double-count this design refuses.
		expect(rows[1].costMicros).toBeNull();
		expect(rows[1].costSource).toBeNull();
		expect(rows[1].costCapturedAt).toBeNull();
	});

	it('shows a quote with no picked lines as labour for the whole subtotal, kept R0,00', async () => {
		// The ordinary case, asserted as a decision: every line hand-typed, so every line is
		// costed at its charge, labour equals the full subtotal, and what you keep is exactly
		// nothing — with the sentence that explains why, and no caveat, because nothing is
		// unknown. See the header of `$lib/core/invoicing/margin.ts`.
		const id = await fromQuote(handTypedLines());
		await as((tx) => issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173'));

		const labour = await as(async (tx) => {
			const rows = await tx
				.select({ account: posting.account, amount: posting.amountCents })
				.from(posting)
				.where(eq(posting.sourceId, id));
			return rows.filter((r) => r.account === 'cost_labour').reduce((n, r) => n + r.amount, 0);
		});
		expect(labour).toBe(2_100_000);

		const panel = await as((tx) => marginFor(tx, id, ZAR, true));
		expect(panel.known).toBe(true);
		if (!panel.known) return;
		expect(rands(panel.margin.keep)).toBe('R0,00');
		expect(panel.margin.caveat).toBeNull();
		expect(panel.margin.labourNote).toContain('what you charged');
	});

	it('reconciles a mixed invoice: labour from the books, the picked line named as unknown', async () => {
		const id = await fromQuote([
			quotedLine({ position: 0, description: 'Labour', unitPriceMicros: 5_000_000_000 }),
			quotedLine({
				position: 1,
				description: 'Materials, cost unrecorded',
				unitPriceMicros: 3_000_000_000,
				sourceItemId: randomUUID()
			})
		]);
		await as((tx) => issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173'));

		const panel = await as((tx) => marginFor(tx, id, ZAR, true));
		expect(panel.known).toBe(true);
		if (!panel.known) return;

		// Revenue 8 000, labour 5 000 read back from `core_posting` — keep 3 000, an upper bound
		// because the picked line's cost is unknown, and both sentences say their piece.
		expect(rands(panel.margin.revenue)).toBe('R8 000,00');
		expect(panel.margin.costs).toHaveLength(1);
		expect(panel.margin.costs[0].kind).toBe('labour');
		expect(rands(panel.margin.costs[0].amount)).toBe('R5 000,00');
		expect(rands(panel.margin.keep)).toBe('R3 000,00');
		expect(panel.margin.caveat).toContain('1 of 2 lines');
		expect(panel.margin.labourNote).toContain('what you charged');
	});

	it('keeps the snapshot when the draft price is edited later', async () => {
		// The quote is the document labour was entered on; a later price edit on the invoice
		// deliberately does not move the snapshot (`reconcileLines` touches no cost column).
		const id = await fromQuote([quotedLine({ unitPriceMicros: 5_000_000_000 })]);
		const existing = await as((tx) =>
			tx.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, id))
		);

		await as((tx) =>
			saveDraft(
				tx,
				thornhill.id,
				id,
				patch({ lines: [line({ id: existing[0].id, unitPriceMicros: 9_000_000_000 })] })
			)
		);

		const [after] = await as((tx) =>
			tx.select().from(invoiceLine).where(eq(invoiceLine.id, existing[0].id))
		);
		expect(after.unitPriceMicros).toBe(9_000_000_000);
		expect(after.costMicros).toBe(5_000_000_000);
		expect(after.costSource).toBe('charged');
	});

	it('carries charged costs onto a duplicate, and never calls them Inventory', async () => {
		const id = await fromQuote([quotedLine({ unitPriceMicros: 5_000_000_000 })]);
		const copyId = await as((tx) => duplicateInvoice(tx, business, id));

		const rows = await as((tx) =>
			tx.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, copyId))
		);
		expect(rows[0].costMicros).toBe(5_000_000_000);
		expect(rows[0].costSource).toBe('charged');

		// The footnote must not say "came from Inventory" over a charge-derived figure.
		expect(await as((tx) => costsCameFromInventory(tx, id))).toBe(false);
	});

	it('is a vocabulary the database itself enforces', async () => {
		// Doubles as proof migration 0011 is live on the database this suite actually runs
		// against: `charged` is accepted (every fixture above), an unknown word is not.
		const id = await fromQuote([quotedLine()]);
		const message = await messageFromRejection(
			as((tx) =>
				tx.execute(sql`
					update invoicing_invoice_line
					   set cost_micros = 1, cost_source = 'sixpence', cost_captured_at = now()
					 where invoice_id = ${id}
				`)
			)
		);
		expect(message).toContain('cost_source_known');
	});
});
