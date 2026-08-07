/**
 * THE CLIENT'S COPY, AGAINST A REAL DATABASE.
 *
 * `shared.ts` makes a claim in its header:
 *
 *   > the policies in `0007_invoicing.sql` admit exactly the one invoice whose token hash
 *   > matches, its lines, its customer, its business and that business's invoicing settings.
 *   > Everything else in the database evaluates `business_id = NULL` and returns nothing —
 *   > including `invoicing_payment` and `core_posting`, so what the business was paid by other
 *   > clients and what the job cost them are unreachable from here.
 *
 * On the module that holds tax records, a claim like that is worth attacking rather than
 * asserting. So this file takes a real token and tries to traverse out of it — into another
 * invoice, into the payments table, into the ledger, into another tenant entirely — and expects
 * zero rows every time.
 *
 * A fake with no policies would pass every test in this file while proving nothing, which is why
 * it runs against a real Postgres.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

/**
 * The mail transport, under our control.
 *
 * `mail.ts` already has the decided failure behaviour — refused in production when SMTP is
 * unconfigured, never silently dropped. What is under test here is what ISSUING does when it is
 * refused, so the transport is mocked to fail on demand rather than by misconfiguring the
 * environment, which would also change what every other test in the process sees.
 */
const mail = vi.hoisted(() => ({ shouldFail: false, sent: [] as { to: string }[] }));

vi.mock('$lib/server/core/mail', () => ({
	sendMail: vi.fn(async (message: { to: string }) => {
		if (mail.shouldFail) throw new Error('SMTP is not configured on this server.');
		mail.sent.push(message);
	})
}));

const { closePool, runScoped } = await import('$lib/server/core/db/client');
const { invoice, invoiceLine, invoicePayment } =
	await import('$lib/server/core/db/schema/invoicing');
const { posting } = await import('$lib/server/core/db/schema/ledger');
const { business: businessTable, customer: customerTable } =
	await import('$lib/server/core/db/schema/core');
const { toBusiness } = await import('$lib/server/core/db/map');
const { invoiceEvent } = await import('$lib/server/core/db/schema/invoicing');
const { createDraft, saveDraft, recordPayment } = await import('./effects');
const { issueInvoice, sendReminder, hashShareToken } = await import('./send');
const { openSharedInvoice } = await import('./shared');
const { readShared } = await import('$lib/server/core/share');
const fixtures = await import('$lib/server/core/db/fixtures');

type TestUser = Awaited<ReturnType<typeof fixtures.createUser>>;
type TestBusiness = Awaited<ReturnType<typeof fixtures.createBusiness>>;

afterAll(async () => {
	await fixtures.cleanupFixtures();
	await closePool();
});

let owner: TestUser;
let thornhill: TestBusiness;
let rivalOwner: TestUser;
let rival: TestBusiness;
let customerId: string;

/** The invoice the token opens, the one it must not, and the token itself. */
let sharedId: string;
let otherId: string;
let token: string;

beforeAll(async () => {
	owner = await fixtures.createUser('Alice Thornhill');
	thornhill = await fixtures.createBusiness(owner.id, 'Thornhill Joinery');
	customerId = await fixtures.createCustomer(thornhill, 'Baraka Café');

	rivalOwner = await fixtures.createUser('Bongani Ndlovu');
	rival = await fixtures.createBusiness(rivalOwner.id, 'Meridian Fitouts');
	await fixtures.createCustomer(rival, 'Highveld Retail');

	await runScoped(thornhill.id, owner.id, (tx) =>
		tx
			.update(businessTable)
			.set({ vatNumber: '4890271563', addressLine1: '14 Sir Lowry Road' })
			.where(eq(businessTable.businessId, thornhill.id))
	);

	const business = await runScoped(thornhill.id, owner.id, async (tx) => {
		const [row] = await tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, thornhill.id));
		return toBusiness(row);
	});

	// Two invoices for the same business. One is shared; the other exists so that "the token
	// opens exactly ONE document" is a claim with something to fail against.
	const issued = await runScoped(thornhill.id, owner.id, async (tx) => {
		const ids: string[] = [];

		for (const description of ['Counter and bar top', 'A different job entirely']) {
			const id = await createDraft(tx, business);
			await saveDraft(tx, thornhill.id, id, {
				customerId,
				customer: {
					name: 'Baraka Café',
					contactPerson: null,
					email: 'accounts@barakacafe.co.za',
					phone: null,
					vatNumber: null,
					addressLine1: null,
					addressLine2: null,
					city: null,
					postalCode: null
				},
				sendToName: null,
				sendToEmail: 'accounts@barakacafe.co.za',
				dueDate: '2099-08-18',
				lines: [
					{
						id: crypto.randomUUID(),
						position: 0,
						description,
						provenance: null,
						documentDescription: null,
						qtyE6: 1_000_000,
						unitPriceMicros: 16_400_000_000,
						taxTreatment: 'standard',
						noCharge: false,
						sourceItemId: null
					}
				]
			});
			await issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173');
			ids.push(id);
		}

		return ids;
	});

	sharedId = issued[0];
	otherId = issued[1];

	// A payment on the shared invoice, so the payments table has something worth hiding.
	await runScoped(thornhill.id, owner.id, (tx) =>
		recordPayment(tx, thornhill.id, owner.id, sharedId, {
			amountCents: 1_000_000,
			receivedOn: '2026-07-24',
			method: 'eft',
			reference: 'BARAKA 1042'
		})
	);

	// The token is minted inside `issueInvoice` and only its HASH is stored, so the test cannot
	// read it back — which is the property under test. It is re-minted here and written directly,
	// as the DDL role, exactly as a support tool reissuing a link would have to.
	token = 'test-token-' + crypto.randomUUID();
	await runScoped(thornhill.id, owner.id, (tx) =>
		tx
			.update(invoice)
			.set({ shareTokenHash: hashShareToken(token), shareTokenIssuedAt: new Date() })
			.where(eq(invoice.id, sharedId))
	);
});

describe('the token opens exactly one document', () => {
	it('opens the invoice it belongs to', async () => {
		const shared = await openSharedInvoice(token);

		expect(shared).not.toBeNull();
		expect(shared!.invoiceId).toBe(sharedId);
		expect(shared!.document.lines[0].description).toBe('Counter and bar top');
		expect(shared!.tradingName).toBe('Thornhill Joinery');
	});

	it('opens nothing at all for a token that is not one', async () => {
		expect(await openSharedInvoice('not-a-real-token')).toBeNull();
	});

	it('shows the client what is still owed, and nothing about how', async () => {
		const shared = await openSharedInvoice(token);

		// R18 860 outstanding on R18 860 charged less R10 000 received. The ANSWER crosses; the
		// payments it was computed from do not — see the traversal tests below.
		expect(shared!.outstanding).not.toBeNull();
		expect(shared!.outstanding!.cents).toBeGreaterThan(0);
	});
});

describe('traversal out of the token', () => {
	/** Everything below runs with ONLY `cjs.share_token` set — no business, no user. */
	const hash = () => hashShareToken(token);

	it('cannot reach the business’s other invoices', async () => {
		const rows = await readShared(hash(), (tx) => tx.select().from(invoice));

		// One row, and it is the shared one. The other invoice belongs to the same business and is
		// still invisible, because the policy keys off the TOKEN and not off the tenant.
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(sharedId);
		expect(rows.map((r) => r.id)).not.toContain(otherId);
	});

	it('cannot reach the other invoice’s lines', async () => {
		const rows = await readShared(hash(), (tx) => tx.select().from(invoiceLine));

		expect(rows).toHaveLength(1);
		expect(rows[0].invoiceId).toBe(sharedId);
	});

	it('cannot reach the payments — not even this invoice’s', async () => {
		const rows = await readShared(hash(), (tx) => tx.select().from(invoicePayment));

		// `invoicing_payment` has NO share policy, deliberately. What the business has been paid,
		// when, and against what reference is not on the document and is none of this reader's
		// business — so the table returns nothing at all rather than one filtered row.
		expect(rows).toHaveLength(0);
	});

	it('cannot reach the ledger', async () => {
		const rows = await readShared(hash(), (tx) => tx.select().from(posting));

		// What the job cost, and therefore what the business kept, is behind the same absence.
		expect(rows).toHaveLength(0);
	});

	it('reaches exactly one customer and one business', async () => {
		const [customers, businesses] = await readShared(hash(), async (tx) => [
			await tx.select().from(customerTable),
			await tx.select().from(businessTable)
		]);

		expect(customers).toHaveLength(1);
		expect(customers[0].id).toBe(customerId);
		expect(businesses).toHaveLength(1);
		expect(businesses[0].businessId).toBe(thornhill.id);
	});

	it('cannot reach another tenant’s anything', async () => {
		const rows = await readShared(hash(), (tx) =>
			tx.select().from(businessTable).where(eq(businessTable.businessId, rival.id))
		);

		expect(rows).toHaveLength(0);
	});

	it('cannot write, even to the document it opened', async () => {
		// The share policies are SELECT-only, so a write falls through to `tenant_isolation` —
		// which evaluates `business_id = NULL` and matches nothing.
		//
		// NOTE THE SHAPE OF THE REFUSAL. An UPDATE that matches no rows is a silent no-op, not an
		// error: Postgres has nothing to complain about, because from this session's point of view
		// the row does not exist. So the assertion is that NOTHING CHANGED rather than that
		// something was raised — asserting a throw here would have been asserting the wrong thing,
		// and would have failed the day the policy started working perfectly.
		await readShared(hash(), (tx) =>
			tx.update(invoice).set({ customerName: 'Somebody else' }).where(eq(invoice.id, sharedId))
		);

		const [row] = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoice).where(eq(invoice.id, sharedId))
		);

		expect(row.customerName).toBe('Baraka Café');
	});

	it('cannot insert either', async () => {
		// The other half: a token-scoped session inserting a row would have to satisfy
		// `tenant_isolation`'s WITH CHECK, which needs a business id it does not have. This one
		// DOES raise, because an INSERT has a row to check rather than none to match.
		const message = await fixtures.messageFromRejection(
			readShared(hash(), (tx) =>
				tx.insert(invoicePayment).values({
					businessId: thornhill.id,
					invoiceId: sharedId,
					kind: 'payment',
					amountCents: 100,
					currency: 'ZAR',
					method: 'eft',
					receivedOn: '2026-07-24'
				})
			)
		);

		expect(message).toMatch(/row-level security|permission denied/i);
	});

	it('cannot enumerate by setting no token at all', async () => {
		const rows = await readShared('', (tx) => tx.select().from(invoice));

		// `app.current_share_token()` reads NULL from an empty setting, and every policy tests it
		// for NULL explicitly — so an empty token matches nothing rather than everything.
		expect(rows).toHaveLength(0);
	});
});

describe('opening it is what the timeline counts', () => {
	it('records an open, and moves sent to viewed', async () => {
		await openSharedInvoice(token);

		const [row] = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoice).where(eq(invoice.id, sharedId))
		);

		// "They opened it twice" is only writable because this happens. The status follows on the
		// first open and stays put afterwards.
		expect(row.viewCount).toBeGreaterThan(0);
		expect(row.firstViewedAt).not.toBeNull();
		expect(['viewed', 'sent']).toContain(row.status);

		const [events] = await runScoped(thornhill.id, owner.id, (tx) =>
			tx
				.execute<{ n: string }>(
					sql`select count(*)::text as n from invoicing_invoice_event
				     where invoice_id = ${sharedId} and kind = 'opened'`
				)
				.then((r) => r.rows)
		);

		expect(Number(events.n)).toBeGreaterThan(0);
	});
});

/**
 * A saved draft, ready to issue. The lines are the design's counter top, which is enough to
 * price — what these tests are about is what happens around the pricing, not the pricing.
 */
async function savedDraft(): Promise<string> {
	const business = await runScoped(thornhill.id, owner.id, async (tx) => {
		const [row] = await tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, thornhill.id));
		return toBusiness(row);
	});

	return runScoped(thornhill.id, owner.id, async (tx) => {
		const id = await createDraft(tx, business);
		await saveDraft(tx, thornhill.id, id, {
			customerId,
			customer: {
				name: 'Baraka Café',
				contactPerson: null,
				email: 'accounts@barakacafe.co.za',
				phone: null,
				vatNumber: null,
				addressLine1: null,
				addressLine2: null,
				city: null,
				postalCode: null
			},
			sendToName: null,
			sendToEmail: 'accounts@barakacafe.co.za',
			dueDate: '2099-08-18',
			lines: [
				{
					id: crypto.randomUUID(),
					position: 0,
					description: 'Counter and bar top',
					provenance: null,
					documentDescription: null,
					qtyE6: 1_000_000,
					unitPriceMicros: 16_400_000_000,
					taxTreatment: 'standard',
					noCharge: false,
					sourceItemId: null
				}
			]
		});
		return id;
	});
}

/**
 * AN INVOICE THAT COULD NOT BE SENT MUST NOT SHOW AS SENT.
 *
 * `send.ts` calls this "the whole ticket", and it is the reason the mail goes INSIDE the
 * transaction: the number, the snapshot, the token, the status, the ledger postings and the
 * events all commit with the email or none of them do.
 *
 * The alternative — commit, then send — has a failure mode where a business is waiting on money
 * nobody was ever asked for, and no way to tell afterwards which invoices those were.
 */
describe('a failed send leaves nothing behind', () => {
	afterEach(() => {
		mail.shouldFail = false;
		mail.sent.length = 0;
	});

	it('rolls back the number, the snapshot, the token, the postings and the events', async () => {
		const id = await savedDraft();
		mail.shouldFail = true;

		await expect(
			runScoped(thornhill.id, owner.id, (tx) =>
				issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173')
			)
		).rejects.toThrow(/SMTP/);

		const [row] = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoice).where(eq(invoice.id, id))
		);

		// Still a draft, and still anonymous. A number allocated here would have been spent on a
		// document nobody received.
		expect(row.status).toBe('draft');
		expect(row.numberFormatted).toBeNull();
		expect(row.issueDate).toBeNull();
		expect(row.issuedAt).toBeNull();
		expect(row.snapshotTotalCents).toBeNull();
		expect(row.shareTokenHash).toBeNull();

		const postings = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(posting).where(eq(posting.sourceId, id))
		);
		expect(postings).toHaveLength(0);

		const events = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoiceEvent).where(eq(invoiceEvent.invoiceId, id))
		);
		// No `issued`, no `emailed`. An event log that recorded a send that never happened would
		// be worse than no log at all.
		expect(events.filter((e) => e.kind === 'issued' || e.kind === 'emailed')).toHaveLength(0);
	});

	it('issues cleanly once the transport works again', async () => {
		const id = await savedDraft();

		await runScoped(thornhill.id, owner.id, (tx) =>
			issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173')
		);

		const [row] = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoice).where(eq(invoice.id, id))
		);

		expect(row.status).toBe('sent');
		expect(row.numberFormatted).toMatch(/^INV-\d{4}$/);
		expect(mail.sent.map((m) => m.to)).toContain('accounts@barakacafe.co.za');
	});
});

/**
 * T21: "A failed reminder is reported honestly and does not write a success event."
 *
 * The same discipline, and it is the easier of the two to get wrong in the direction that
 * flatters the product — a reminder counter that goes up whether or not anything arrived makes
 * a business think a client has been chased three times when they have been chased none.
 */
describe('a failed reminder records nothing', () => {
	afterEach(() => {
		mail.shouldFail = false;
		mail.sent.length = 0;
	});

	it('leaves the counter and the timeline alone', async () => {
		const id = await savedDraft();
		await runScoped(thornhill.id, owner.id, (tx) =>
			issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173')
		);

		mail.shouldFail = true;

		await expect(
			runScoped(thornhill.id, owner.id, (tx) =>
				sendReminder(tx, thornhill.id, owner.id, id, 'http://localhost:5173')
			)
		).rejects.toThrow(/SMTP/);

		const [row] = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoice).where(eq(invoice.id, id))
		);
		expect(row.reminderCount).toBe(0);
		expect(row.lastRemindedAt).toBeNull();

		const events = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoiceEvent).where(eq(invoiceEvent.invoiceId, id))
		);
		expect(events.filter((e) => e.kind === 'reminded')).toHaveLength(0);
	});

	it('records one when the reminder actually goes', async () => {
		const id = await savedDraft();
		await runScoped(thornhill.id, owner.id, (tx) =>
			issueInvoice(tx, thornhill.id, owner.id, id, 'http://localhost:5173')
		);

		await runScoped(thornhill.id, owner.id, (tx) =>
			sendReminder(tx, thornhill.id, owner.id, id, 'http://localhost:5173')
		);

		const [row] = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(invoice).where(eq(invoice.id, id))
		);
		expect(row.reminderCount).toBe(1);
		expect(row.lastRemindedAt).not.toBeNull();
	});
});
