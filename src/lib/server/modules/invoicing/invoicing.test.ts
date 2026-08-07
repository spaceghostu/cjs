/**
 * INVOICING, AGAINST A REAL DATABASE.
 *
 * T19's acceptance criteria, one describe block each. Every one of them is about something that
 * is invisible until it is catastrophic: a tax record that was quietly edited after a client
 * received it, a payment deleted rather than reversed, a margin figure that agrees with nothing.
 *
 * These run against a real Postgres because every guarantee under test is one Postgres makes. A
 * fake with no triggers would pass the immutability tests while proving nothing at all — which
 * is precisely the failure mode T19 wrote "the attempt fails at the database, not just the UI"
 * to prevent.
 *
 * Requires a database: `bun run db:dev`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { formatZar, ZAR, type Money } from '$lib/core/money';
import { money } from '$lib/core/money/ctor';
import {
	INVOICE_FILTERS,
	matchesFilter,
	priceInvoice,
	settle,
	REVERSAL_WINDOW_DAYS
} from '$lib/core/invoicing';
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
import { invoice, invoiceLine, invoicePayment } from '$lib/server/core/db/schema/invoicing';
import { posting } from '$lib/server/core/db/schema/ledger';
import { toBusiness, type Business } from '$lib/server/core/db/map';
import type { Tx } from '$lib/server/core/db/tx';
import { createDraft, cancelInvoice, recordPayment, reversePayment, saveDraft } from './effects';
import { issueInvoice } from './send';
import {
	MAX_PAGE_SIZE,
	countInvoices,
	listInvoices,
	loadInvoice,
	loadPayments,
	summarise
} from './queries';
import { ledgerOutstanding } from './ledger';
import { marginFor } from './margin';
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

/** The design's INV-1042, as a payload. Quantity 2 at R2 300 each — a line total of R4 600. */
function inv1042Lines(): LinePatch[] {
	return [
		line({ position: 0, description: 'Counter and bar top', unitPriceMicros: 16_400_000_000 }),
		line({
			position: 1,
			description: 'Shelving unit',
			qtyE6: 2_000_000,
			unitPriceMicros: 2_300_000_000
		}),
		line({
			position: 2,
			description: 'Fitting and finishing',
			unitPriceMicros: 0,
			noCharge: true
		})
	];
}

/** A draft, saved and issued, ready to be paid. Returns its id. */
async function issued(lines: LinePatch[] = inv1042Lines()): Promise<string> {
	return as(async (tx) => {
		const id = await createDraft(tx, business);
		await saveDraft(tx, thornhill.id, id, patch({ lines }));
		await issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173');
		return id;
	});
}

describe('INV-1042 reproduces exactly', () => {
	it('prices the design’s invoice to the cent, from real rows', async () => {
		const id = await issued();

		const [header, model] = await as(async (tx) => [
			(await tx.select().from(invoice).where(eq(invoice.id, id)))[0],
			await loadInvoice(tx, id)
		]);

		const price = priceInvoice(model!);
		expect(rands(price.subtotal)).toBe('R21 000,00');
		expect(rands(price.tax)).toBe('R3 150,00');
		expect(rands(price.total)).toBe('R24 150,00');

		// And the SNAPSHOT agrees with the live pricing, which is what makes reprinting the
		// document years later reproduce the number the client was sent.
		expect(header.snapshotSubtotalCents).toBe(2_100_000);
		expect(header.snapshotTaxCents).toBe(315_000);
		expect(header.snapshotTotalCents).toBe(2_415_000);
	});

	it('gives it a number, a date and a share token, all at once', async () => {
		const id = await issued();
		const header = await as(
			async (tx) => (await tx.select().from(invoice).where(eq(invoice.id, id)))[0]
		);

		expect(header.numberFormatted).toMatch(/^INV-\d{4}$/);
		expect(header.status).toBe('sent');
		expect(header.issueDate).not.toBeNull();
		expect(header.shareTokenHash).not.toBeNull();
		expect(header.issuedAt).not.toBeNull();
	});
});

describe('an issued invoice cannot be edited', () => {
	it('refuses a changed line at the DATABASE, not just in the UI', async () => {
		const id = await issued();
		const [firstLine] = await as((tx) =>
			tx.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, id)).limit(1)
		);

		const message = await messageFromRejection(
			as((tx) =>
				tx.update(invoiceLine).set({ unitPriceMicros: 1 }).where(eq(invoiceLine.id, firstLine.id))
			)
		);

		expect(message).toContain('has been issued');
		expect(message).toContain('credit note');
	});

	it('refuses a new line on an issued invoice', async () => {
		const id = await issued();

		const message = await messageFromRejection(
			as((tx) =>
				tx.insert(invoiceLine).values({
					businessId: thornhill.id,
					invoiceId: id,
					description: 'Snuck in later',
					qtyE6: 1_000_000,
					unitPriceMicros: 500_000_000,
					currency: 'ZAR'
				})
			)
		);

		expect(message).toContain('has been issued');
	});

	it('refuses a changed total, client, number or date', async () => {
		const id = await issued();

		for (const change of [
			{ snapshotTotalCents: 1 },
			{ customerName: 'Somebody else' },
			{ numberFormatted: 'INV-9999' },
			{ dueDate: '2099-12-31' },
			{ vatRatePpm: 200_000 }
		]) {
			const message = await messageFromRejection(
				as((tx) => tx.update(invoice).set(change).where(eq(invoice.id, id)))
			);
			expect(message).toContain('cannot be changed');
		}
	});

	it('refuses to archive an issued invoice — a tax record has no tidy-away', async () => {
		const id = await issued();

		const message = await messageFromRejection(
			as((tx) => tx.update(invoice).set({ archivedAt: new Date() }).where(eq(invoice.id, id)))
		);

		expect(message).toContain('archived_at');
	});

	it('refuses to put an issued invoice back into draft', async () => {
		const id = await issued();

		const message = await messageFromRejection(
			as((tx) => tx.update(invoice).set({ status: 'draft' }).where(eq(invoice.id, id)))
		);

		expect(message).toContain('cannot go back to being a draft');
	});

	it('still lets a DRAFT be edited freely', async () => {
		const id = await as(async (tx) => {
			const draft = await createDraft(tx, business);
			await saveDraft(tx, thornhill.id, draft, patch());
			await saveDraft(tx, thornhill.id, draft, patch({ lines: inv1042Lines() }));
			return draft;
		});

		const model = await as((tx) => loadInvoice(tx, id));
		expect(model?.lines).toHaveLength(3);
	});
});

describe('payments', () => {
	it('settles an invoice, and says when', async () => {
		const id = await issued();

		const result = await as((tx) =>
			recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 2_415_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: 'MERIDIAN 1042'
			})
		);

		expect(result.settled).toBe(true);
		expect(result.outstanding.cents).toBe(0);

		const header = await as(
			async (tx) => (await tx.select().from(invoice).where(eq(invoice.id, id)))[0]
		);
		expect(header.status).toBe('paid');
		expect(header.paidOn).toBe('2026-07-24');
	});

	it('leaves a part-paid invoice unpaid, and owes the balance', async () => {
		const id = await issued();

		const result = await as((tx) =>
			recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 1_000_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			})
		);

		expect(result.settled).toBe(false);
		expect(rands(result.outstanding)).toBe('R14 150,00');
	});

	it('reverses by writing a ROW — nothing is ever deleted', async () => {
		const id = await issued();

		const paymentId = await as(async (tx) => {
			await recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 2_415_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			});
			const [p] = await tx.select().from(invoicePayment).where(eq(invoicePayment.invoiceId, id));
			return p.id;
		});

		const result = await as((tx) => reversePayment(tx, thornhill.id, owner.id, id, paymentId));

		expect(result.settled).toBe(false);
		expect(rands(result.outstanding)).toBe('R24 150,00');

		// Both rows are still there. "We recorded R24 150 and took it back" is a different history
		// from "we never recorded anything", and only one of them is true.
		const payments = await as((tx) => loadPayments(tx, id));
		expect(payments).toHaveLength(2);
		expect(payments.map((p) => p.kind).sort()).toEqual(['payment', 'reversal']);

		// And the invoice is owed again, back in the state the client last saw it in.
		const header = await as(
			async (tx) => (await tx.select().from(invoice).where(eq(invoice.id, id)))[0]
		);
		expect(header.status).toBe('sent');
		expect(header.paidAt).toBeNull();
		expect(header.paidOn).toBeNull();
	});

	it('refuses a second reversal of the same payment', async () => {
		const id = await issued();
		const paymentId = await as(async (tx) => {
			await recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 2_415_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			});
			const [p] = await tx.select().from(invoicePayment).where(eq(invoicePayment.invoiceId, id));
			return p.id;
		});

		await as((tx) => reversePayment(tx, thornhill.id, owner.id, id, paymentId));

		await expect(
			as((tx) => reversePayment(tx, thornhill.id, owner.id, id, paymentId))
		).rejects.toThrow(/already been undone/);
	});

	it(`refuses a reversal after ${REVERSAL_WINDOW_DAYS} days, at the database`, async () => {
		const id = await issued();

		// The payment is RECORDED 31 days ago rather than backdated afterwards — because
		// backdating it afterwards is an UPDATE, and `enforce_payment_rules` refuses those. (That
		// refusal is itself under test above; a payment whose amount or date could be edited would
		// be a way around this very window.)
		const longAgo = new Date(Date.now() - (REVERSAL_WINDOW_DAYS + 1) * 86_400_000);

		const paymentId = await as(async (tx) => {
			await recordPayment(
				tx,
				thornhill.id,
				owner.id,
				id,
				{ amountCents: 2_415_000, receivedOn: '2026-07-24', method: 'eft', reference: null },
				longAgo
			);
			const [p] = await tx.select().from(invoicePayment).where(eq(invoicePayment.invoiceId, id));
			return p.id;
		});

		// The service refuses it with a sentence somebody can act on…
		await expect(
			as((tx) => reversePayment(tx, thornhill.id, owner.id, id, paymentId))
		).rejects.toThrow(/30 days/);

		// …and so does the database, which is what stops a bug in the service from mattering.
		const message = await messageFromRejection(
			as((tx) =>
				tx.insert(invoicePayment).values({
					businessId: thornhill.id,
					invoiceId: id,
					kind: 'reversal',
					amountCents: 2_415_000,
					currency: 'ZAR',
					method: 'eft',
					receivedOn: '2026-08-30',
					reversesPaymentId: paymentId
				})
			)
		);
		expect(message).toContain('30 days');
	});

	it('refuses to edit a recorded payment', async () => {
		const id = await issued();
		const paymentId = await as(async (tx) => {
			await recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 1_000_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			});
			const [p] = await tx.select().from(invoicePayment).where(eq(invoicePayment.invoiceId, id));
			return p.id;
		});

		const message = await messageFromRejection(
			as((tx) =>
				tx
					.update(invoicePayment)
					.set({ amountCents: 2_415_000 })
					.where(eq(invoicePayment.id, paymentId))
			)
		);

		expect(message).toContain('cannot be edited');
	});

	it('refuses a reversal that does not exactly undo its payment', async () => {
		const id = await issued();
		const paymentId = await as(async (tx) => {
			await recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 1_000_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			});
			const [p] = await tx.select().from(invoicePayment).where(eq(invoicePayment.invoiceId, id));
			return p.id;
		});

		const message = await messageFromRejection(
			as((tx) =>
				tx.insert(invoicePayment).values({
					businessId: thornhill.id,
					invoiceId: id,
					kind: 'reversal',
					amountCents: 999_999,
					currency: 'ZAR',
					method: 'eft',
					receivedOn: '2026-07-25',
					reversesPaymentId: paymentId
				})
			)
		);

		expect(message).toContain('exactly reverse');
	});
});

describe('cancellation', () => {
	it('is irreversible', async () => {
		const id = await issued();
		await as((tx) => cancelInvoice(tx, thornhill.id, owner.id, id, 'Client changed their mind'));

		const header = await as(
			async (tx) => (await tx.select().from(invoice).where(eq(invoice.id, id)))[0]
		);
		expect(header.status).toBe('cancelled');
		expect(header.cancelledReason).toBe('Client changed their mind');

		// Not through the service…
		await expect(as((tx) => cancelInvoice(tx, thornhill.id, owner.id, id, null))).rejects.toThrow(
			/already been cancelled/
		);

		// …and not around it either.
		const message = await messageFromRejection(
			as((tx) => tx.update(invoice).set({ status: 'sent' }).where(eq(invoice.id, id)))
		);
		expect(message).toContain('cannot be undone');
	});

	it('is refused once money has been received', async () => {
		const id = await issued();
		await as((tx) =>
			recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 1_000_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			})
		);

		await expect(as((tx) => cancelInvoice(tx, thornhill.id, owner.id, id, null))).rejects.toThrow(
			/credit note/
		);
	});

	it('takes the receivable back off the books', async () => {
		const id = await issued();
		const before = await as((tx) => ledgerOutstanding(tx, id, ZAR));
		expect(rands(before)).toBe('R24 150,00');

		await as((tx) => cancelInvoice(tx, thornhill.id, owner.id, id, null));

		const after = await as((tx) => ledgerOutstanding(tx, id, ZAR));
		expect(after.cents).toBe(0);
	});
});

describe('the ledger', () => {
	it('balances every entry, or refuses to commit', async () => {
		const message = await messageFromRejection(
			as((tx) =>
				tx.insert(posting).values({
					businessId: thornhill.id,
					entryId: '11111111-1111-4111-8111-111111111111',
					entryKind: 'hand_written',
					account: 'revenue',
					amountCents: -100,
					currency: 'ZAR',
					sourceKind: 'invoice',
					sourceId: '22222222-2222-4222-8222-222222222222',
					occurredOn: '2026-07-18'
				})
			)
		);

		expect(message).toContain('does not balance');
	});

	it('agrees with the module about what is outstanding', async () => {
		const id = await issued();

		await as((tx) =>
			recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 1_000_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			})
		);

		// Two independent routes to one number: the module settles payments against the snapshot,
		// the ledger nets receivable postings against allocations. "Reconciles" means this.
		const [fromModule, fromLedger] = await as(async (tx) => {
			const model = await loadInvoice(tx, id);
			const payments = await loadPayments(tx, id);
			return [
				settle(priceInvoice(model!).total, payments).outstanding,
				await ledgerOutstanding(tx, id, ZAR)
			];
		});

		expect(fromLedger.cents).toBe(fromModule.cents);
		expect(rands(fromLedger)).toBe('R14 150,00');
	});

	it('nets a reversal back out again', async () => {
		const id = await issued();
		const paymentId = await as(async (tx) => {
			await recordPayment(tx, thornhill.id, owner.id, id, {
				amountCents: 2_415_000,
				receivedOn: '2026-07-24',
				method: 'eft',
				reference: null
			});
			const [p] = await tx.select().from(invoicePayment).where(eq(invoicePayment.invoiceId, id));
			return p.id;
		});

		await as((tx) => reversePayment(tx, thornhill.id, owner.id, id, paymentId));

		const outstanding = await as((tx) => ledgerOutstanding(tx, id, ZAR));
		expect(rands(outstanding)).toBe('R24 150,00');
	});

	it('keeps VAT out of revenue', async () => {
		const id = await issued();

		const rows = await as((tx) =>
			tx
				.select({ account: posting.account, amount: posting.amountCents })
				.from(posting)
				.where(eq(posting.sourceId, id))
		);

		const revenue = rows.find((r) => r.account === 'revenue');
		const vat = rows.find((r) => r.account === 'vat_output');

		// Credits are negative. Revenue is the SUBTOTAL, never the total — VAT was never the
		// business's money, and folding it in would overstate every margin by the VAT rate.
		expect(revenue?.amount).toBe(-2_100_000);
		expect(vat?.amount).toBe(-315_000);
	});
});

describe('the margin panel', () => {
	it('degrades honestly when no cost is known', async () => {
		const id = await issued();
		const panel = await as((tx) => marginFor(tx, id, ZAR, false));

		expect(panel.known).toBe(false);
		if (panel.known) return;
		expect(panel.unavailable.offerInventory).toBe(true);
	});

	it('reconciles to postings when costs are recorded', async () => {
		// A draft whose lines carry a cost snapshot, as a line drawn from Inventory would.
		const id = await as(async (tx) => {
			const draft = await createDraft(tx, business);
			await saveDraft(tx, thornhill.id, draft, patch({ lines: inv1042Lines() }));

			// The cost side is server-written — the editor never sends one — so it is set directly
			// here, exactly as the Inventory picker will at T23.
			await tx.execute(sql`
				update invoicing_invoice_line
				   set cost_micros = 8130000000, cost_source = 'inventory', cost_captured_at = now()
				 where invoice_id = ${draft} and description = 'Counter and bar top'
			`);

			await issueInvoice(tx, thornhill.id, owner.id, draft, 'http://localhost:5173');
			return draft;
		});

		const panel = await as((tx) => marginFor(tx, id, ZAR, true));

		expect(panel.known).toBe(true);
		if (!panel.known) return;

		// Revenue 21 000, materials 8 130 → kept 12 870, and the panel says the other two lines
		// have no cost recorded rather than treating them as free.
		expect(rands(panel.margin.revenue)).toBe('R21 000,00');
		expect(rands(panel.margin.costs[0].amount)).toBe('R8 130,00');
		expect(rands(panel.margin.keep)).toBe('R12 870,00');
		expect(panel.margin.caveat).toContain('2 of 3 lines');
	});
});

describe('the list', () => {
	it('counts every tab, including the zeroes', async () => {
		const counts = await as((tx) => countInvoices(tx));

		// `Overdue 0` is SHOWN, not hidden — so the query has to produce it even when nothing is
		// late. A query that only returned non-empty groups would leave the tab blank.
		expect(counts).toHaveProperty('overdue');
		expect(typeof counts.overdue).toBe('number');
		expect(counts.all).toBeGreaterThan(0);
	});

	/**
	 * `filter.ts` claims the SQL counts and `matchesFilter` cannot disagree about what a tab
	 * means. This is that claim, tested: the counts come from `count(*) FILTER (...)` in
	 * Postgres, the rows come back through `effectiveInvoiceStatus`, and the two are compared.
	 *
	 * They are two different implementations of one rule — one in SQL, one in TypeScript — and
	 * the day they drift, the tab will say 6 and show 5.
	 */
	it('counts the same invoices its rows match', async () => {
		const now = new Date();
		const counts = await as((tx) => countInvoices(tx, now));

		for (const filter of INVOICE_FILTERS) {
			const page = await as((tx) => listInvoices(tx, { filter, pageSize: MAX_PAGE_SIZE, now }));

			// Every row the query returned belongs under the tab that asked for it…
			for (const row of page.items) {
				expect(matchesFilter(filter, row.status)).toBe(true);
			}

			// …and there are exactly as many as the tab says.
			expect(page.total).toBe(counts[filter]);
		}
	});

	it('is bounded and paged', async () => {
		const page = await as((tx) => listInvoices(tx, { pageSize: 2 }));

		expect(page.items.length).toBeLessThanOrEqual(2);
		expect(page.pageSize).toBe(2);
		expect(page.total).toBeGreaterThanOrEqual(page.items.length);
	});

	it('shows a draft with no number and no total', async () => {
		const id = await as(async (tx) => {
			const draft = await createDraft(tx, business);
			await saveDraft(tx, thornhill.id, draft, patch({ lines: [] }));
			return draft;
		});

		const page = await as((tx) => listInvoices(tx, { filter: 'drafts', pageSize: 100 }));
		const row = page.items.find((i) => i.id === id);

		expect(row?.number).toBeNull();
		// A draft's total is only knowable by pricing it, and the list is not the place to do that
		// fifty times. The design agrees: a draft shows `—`.
		expect(row?.total).toBeNull();
		expect(row?.hasAmount).toBe(false);
	});

	it('derives overdue from the due date rather than reading a column', async () => {
		const id = await issued();

		// Move the due date into the past. Done in SQL because the freeze trigger refuses it
		// through the application — which is itself the point of the trigger.
		await runScoped(thornhill.id, owner.id, (tx) =>
			tx.execute(sql`
				alter table invoicing_invoice disable trigger "invoicing_invoice_freeze"
			`)
		).catch(() => {
			// The application role cannot disable a trigger it does not own, which is correct. The
			// test below reads the derivation directly instead.
		});

		const page = await as((tx) =>
			listInvoices(tx, { pageSize: 100, now: new Date('2099-12-31T00:00:00Z') })
		);
		const row = page.items.find((i) => i.id === id);

		// Same row, same column, later clock — and it reads as overdue without anything having
		// been written. That is what "derived, never stored" buys.
		expect(row?.status).toBe('overdue');

		const stored = await as(
			async (tx) => (await tx.select().from(invoice).where(eq(invoice.id, id)))[0]
		);
		expect(stored.status).toBe('sent');
	});

	it('summarises what is owed without counting cancelled or draft invoices', async () => {
		const totals = await as((tx) => summarise(tx, ZAR));

		expect(totals.owed.cents).toBeGreaterThan(0);
		expect(totals.unpaidCount).toBeGreaterThan(0);
		// Every unpaid invoice in this suite is due in 2099, so nothing here is late.
		expect(totals.overdueCount).toBe(0);
		expect(totals.overdue.cents).toBe(0);
	});
});

describe('tenancy', () => {
	it('hides one business’s invoices from another', async () => {
		const otherOwner = await createUser('Bob Elsewhere');
		const other = await createBusiness(otherOwner.id, 'Elsewhere Cabinetry');

		const mine = await issued();

		const visible = await runScoped(other.id, otherOwner.id, (tx) =>
			tx.select().from(invoice).where(eq(invoice.id, mine))
		);

		// Not an error — zero rows. "Another business's invoice" and "no such invoice" are the same
		// answer, which is exactly what they should be to somebody guessing at URLs.
		expect(visible).toHaveLength(0);
	});
});

describe('money is never a float', () => {
	it('stores exact cents and reads them back exactly', async () => {
		const id = await issued([
			line({ description: 'An awkward number', qtyE6: 3_000_000, unitPriceMicros: 33_333_333 })
		]);

		const model = await as((tx) => loadInvoice(tx, id));
		const price = priceInvoice(model!);

		// R33,333333 × 3 = R99,999999, which rounds to R100,00 exactly once — at the line amount.
		expect(price.subtotal.cents).toBe(10_000);
		expect(rands(price.total)).toBe('R115,00');
		expect(Number.isInteger(price.total.cents)).toBe(true);
	});

	it('refuses a payment of nothing', async () => {
		const id = await issued();

		const message = await messageFromRejection(
			as((tx) =>
				tx.insert(invoicePayment).values({
					businessId: thornhill.id,
					invoiceId: id,
					kind: 'payment',
					amountCents: 0,
					currency: 'ZAR',
					method: 'eft',
					receivedOn: '2026-07-24'
				})
			)
		);

		expect(message).toContain('invoicing_payment_amount_positive');
	});

	it('refuses a no-charge line that carries a price', async () => {
		const id = await as(async (tx) => {
			const draft = await createDraft(tx, business);
			await saveDraft(tx, thornhill.id, draft, patch({ lines: [] }));
			return draft;
		});

		const message = await messageFromRejection(
			as((tx) =>
				tx.insert(invoiceLine).values({
					businessId: thornhill.id,
					invoiceId: id,
					description: 'Included, apparently',
					qtyE6: 1_000_000,
					unitPriceMicros: 500_000_000,
					noCharge: true,
					currency: 'ZAR'
				})
			)
		);

		expect(message).toContain('no_charge_is_zero');
	});
});

/** Money constructed in a test is allowed — ESLint zone 5 lists `*.test.ts` explicitly. */
export const _unused = money(0, ZAR);
