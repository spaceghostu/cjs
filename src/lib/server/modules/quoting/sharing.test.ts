/**
 * SENDING AND ACCEPTING, AGAINST A REAL DATABASE.
 *
 * T18's acceptance criteria. Two of them are the reason this file exists at all:
 *
 *   "A failed send never leaves a quote marked sent."
 *   "The client page exposes exactly one document and no other tenant data — verified by an
 *    integration test that attempts traversal."
 *
 * Neither can be proved against a fake. The first is a claim about a transaction rolling back;
 * the second is a claim about four Row Level Security policies, and a stub with no policies
 * would pass it while proving nothing at all.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

/**
 * The mail transport, under our control.
 *
 * `mail.ts` has the decided failure behaviour already — refused in production when SMTP is
 * unconfigured, never silently dropped — and what is under test here is what SENDING does when
 * it is refused. So the transport is mocked to fail on demand rather than by misconfiguring the
 * environment, which would also change what every other test in the process sees.
 */
const mail = vi.hoisted(() => ({
	shouldFail: false,
	sent: [] as { to: string; subject: string; text: string; attachments?: unknown[] }[]
}));

vi.mock('$lib/server/core/mail', () => ({
	sendMail: vi.fn(async (message: (typeof mail.sent)[number]) => {
		if (mail.shouldFail) throw new Error('SMTP is not configured on this server.');
		mail.sent.push(message);
	})
}));

const { closePool, runScoped } = await import('$lib/server/core/db/client');
const { quote, quoteEvent } = await import('$lib/server/core/db/schema/quoting');
const { business: businessTable } = await import('$lib/server/core/db/schema/core');
const { toBusiness } = await import('$lib/server/core/db/map');
const { createDraft, saveDraft } = await import('./effects');
const { sendQuote, hashShareToken } = await import('./send');
const { answerSharedQuote, openSharedQuote } = await import('./accept');
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
let rival: TestBusiness;
let rivalOwner: TestUser;
let customerId: string;

beforeAll(async () => {
	owner = await fixtures.createUser('Alice Thornhill');
	thornhill = await fixtures.createBusiness(owner.id, 'Thornhill Joinery');
	customerId = await fixtures.createCustomer(thornhill, 'Fynbos Interiors');

	rivalOwner = await fixtures.createUser('Bongani Ndlovu');
	rival = await fixtures.createBusiness(rivalOwner.id, 'Meridian Fitouts');
	await fixtures.createCustomer(rival, 'Highveld Retail');

	await runScoped(thornhill.id, owner.id, (tx) =>
		tx
			.update(businessTable)
			.set({ vatNumber: '4890271563', addressLine1: '14 Sir Lowry Road', city: 'Cape Town' })
			.where(eq(businessTable.businessId, thornhill.id))
	);
});

beforeEach(() => {
	mail.shouldFail = false;
	mail.sent.length = 0;
});

/** A draft with one line, ready to send. */
async function draftReadyToSend(validUntil = '2099-12-31'): Promise<string> {
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
			validUntil,
			deposit: { kind: 'rate', ppm: 500_000 },
			lines: [
				{
					id: crypto.randomUUID(),
					position: 0,
					description: 'Solid oak kitchen island top',
					provenance: null,
					documentDescription: null,
					qtyE6: 1_000_000,
					unitPriceMicros: 24_800_000_000,
					taxTreatment: 'standard',
					sourceItemId: null
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

function headerOf(quoteId: string) {
	return runScoped(thornhill.id, owner.id, async (tx) => {
		const [row] = await tx.select().from(quote).where(eq(quote.id, quoteId));
		return row;
	});
}

describe('sending', () => {
	it('allocates a number, freezes the totals and mints a token, all at once', async () => {
		const id = await draftReadyToSend();
		const result = await send(id);
		const row = await headerOf(id);

		expect(result.number).toMatch(/^QT-\d{4}$/);
		expect(row.status).toBe('sent');
		expect(row.numberFormatted).toBe(result.number);

		// The snapshot: 24 800 -> VAT 3 720 -> 28 520. The database refuses a set that does not
		// reconcile, so storing it at all is half the assertion.
		expect(row.snapshotSubtotalCents).toBe(2_480_000);
		expect(row.snapshotTaxCents).toBe(372_000);
		expect(row.snapshotTotalCents).toBe(2_852_000);
		expect(row.snapshotAt).toBeInstanceOf(Date);

		// The hash, never the token. A leaked backup hands somebody a value that opens nothing.
		expect(row.shareTokenHash).toBe(hashShareToken(result.token));
		expect(row.shareTokenHash).not.toBe(result.token);
		expect(result.token.length).toBeGreaterThanOrEqual(40);
	});

	it('emails the client, with the PDF attached and the link in the body', async () => {
		const id = await draftReadyToSend();
		const result = await send(id);

		expect(mail.sent).toHaveLength(1);
		expect(mail.sent[0].to).toBe('renske@fynbosinteriors.co.za');
		expect(mail.sent[0].subject).toContain(result.number);
		expect(mail.sent[0].text).toContain(`https://cjs.test/q/${result.token}`);
		expect(mail.sent[0].attachments).toHaveLength(1);
	});

	it('writes a timestamped event', async () => {
		const id = await draftReadyToSend();
		await send(id);

		const events = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(quoteEvent).where(eq(quoteEvent.quoteId, id))
		);

		expect(events).toHaveLength(1);
		expect(events[0].kind).toBe('sent');
		expect(events[0].actor).toBe('business');
		expect(events[0].occurredAt).toBeInstanceOf(Date);
	});

	/**
	 * The criterion, stated as a test.
	 *
	 * The mail goes INSIDE the transaction, before it commits, so a refusal rolls back the
	 * number, the snapshot, the token and the status together. The alternative — commit, then
	 * send — has a failure mode where a client is told their quote is on its way and it is not,
	 * and no way afterwards to tell which quotes those were.
	 */
	it('leaves nothing behind when the mail cannot be sent', async () => {
		const id = await draftReadyToSend();
		mail.shouldFail = true;

		await expect(send(id)).rejects.toThrow(/SMTP/);

		const row = await headerOf(id);
		expect(row.status).toBe('draft');
		expect(row.numberFormatted).toBeNull();
		expect(row.shareTokenHash).toBeNull();
		expect(row.snapshotTotalCents).toBeNull();
		expect(row.sentAt).toBeNull();

		const events = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(quoteEvent).where(eq(quoteEvent.quoteId, id))
		);
		expect(events).toHaveLength(0);
	});

	it('refuses a quote that has already been sent', async () => {
		const id = await draftReadyToSend();
		await send(id);
		await expect(send(id)).rejects.toThrow(/already been sent/);
	});

	it('refuses a quote with nowhere to send it', async () => {
		const id = await runScoped(thornhill.id, owner.id, async (tx) => {
			const [row] = await tx
				.select()
				.from(businessTable)
				.where(eq(businessTable.businessId, thornhill.id));
			return createDraft(tx, toBusiness(row), { customerId });
		});

		await runScoped(thornhill.id, owner.id, (tx) =>
			tx.update(quote).set({ sendToEmail: null }).where(eq(quote.id, id))
		);

		await expect(send(id)).rejects.toThrow(/email address/);
		expect((await headerOf(id)).status).toBe('draft');
	});
});

describe('the shared link', () => {
	it('opens exactly one document', async () => {
		const id = await draftReadyToSend();
		const { token, number } = await send(id);

		const shared = await openSharedQuote(token);

		expect(shared).not.toBeNull();
		expect(shared!.document.number).toBe(number);
		expect(shared!.document.party.name).toBe('Fynbos Interiors');
		expect(shared!.tradingName).toBe('Thornhill Joinery');
		expect(shared!.canAnswer).toBe(true);
	});

	it('opens nothing for a token that is not one', async () => {
		expect(await openSharedQuote('not-a-real-token')).toBeNull();
		expect(await openSharedQuote('')).toBeNull();
	});

	/**
	 * THE TRAVERSAL.
	 *
	 * A share token sets `cjs.share_token` and nothing else. What follows is not "the route is
	 * careful" — it is the four `document_share` policies in `0006_quote_sharing.sql` refusing
	 * everything they do not name. Every query below is one an attacker who reached this
	 * transaction would try.
	 */
	it('reaches no other tenant data at all', async () => {
		const mine = await draftReadyToSend();
		const { token } = await send(mine);

		// A second quote, same business — the closest thing there is to a legitimate neighbour.
		const sibling = await draftReadyToSend();
		await send(sibling);

		const hash = hashShareToken(token);

		await readShared(hash, async (tx) => {
			// Quotes: exactly one, and it is the one the token names.
			const quotes = await tx.execute<{ id: string }>(sql`select id from quoting_quote`);
			expect(quotes.rows.map((r) => r.id)).toEqual([mine]);

			// Naming the sibling explicitly does not help. A policy is not a filter a query can
			// opt out of.
			const named = await tx.execute(sql`select * from quoting_quote where id = ${sibling}`);
			expect(named.rows).toHaveLength(0);

			// Lines: only this document's.
			const lines = await tx.execute<{ quote_id: string }>(
				sql`select quote_id from quoting_quote_line`
			);
			expect(new Set(lines.rows.map((r) => r.quote_id))).toEqual(new Set([mine]));

			// Customers: one — the one this document is addressed to. Not the address book.
			const customers = await tx.execute<{ id: string }>(sql`select id from core_customer`);
			expect(customers.rows.map((r) => r.id)).toEqual([customerId]);

			// Businesses: one, and it is the issuer. Never the rival.
			const businesses = await tx.execute<{ business_id: string }>(
				sql`select business_id from core_business`
			);
			expect(businesses.rows.map((r) => r.business_id)).toEqual([thornhill.id]);

			// Everything else in the database: nothing. No policy names these for a share token,
			// so they evaluate `business_id = NULL` and return zero rows.
			for (const table of [
				'core_member',
				'core_document_number',
				'billing_subscription',
				'quoting_setting',
				'quoting_quote_event',
				'audit.row_change'
			]) {
				const { rows } = await tx.execute(sql.raw(`select * from ${table}`));
				expect(rows, `${table} should be unreachable with only a share token`).toHaveLength(0);
			}
		});
	});

	it('counts opens, and moves sent to viewed exactly once', async () => {
		const id = await draftReadyToSend();
		const { token } = await send(id);

		await openSharedQuote(token);
		await openSharedQuote(token);

		const row = await headerOf(id);
		expect(row.status).toBe('viewed');
		expect(row.viewCount).toBe(2);
		expect(row.firstViewedAt).toBeInstanceOf(Date);

		const events = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(quoteEvent).where(eq(quoteEvent.quoteId, id))
		);
		// The design's "Opened it twice" is a count of these.
		expect(events.filter((e) => e.kind === 'viewed')).toHaveLength(2);
	});
});

describe('answering', () => {
	it('accepts once, records who, and refuses the second attempt', async () => {
		const id = await draftReadyToSend();
		const { token } = await send(id);

		const first = await answerSharedQuote(token, 'accepted', { name: 'Waterkant Property Group' });
		expect(first.ok).toBe(true);

		const row = await headerOf(id);
		expect(row.status).toBe('accepted');
		expect(row.acceptedByName).toBe('Waterkant Property Group');
		expect(row.acceptedAt).toBeInstanceOf(Date);

		const second = await answerSharedQuote(token, 'accepted', { name: 'Someone else' });
		expect(second).toEqual({ ok: false, message: 'This quote has already been accepted.' });

		// And the record still says who actually accepted it.
		expect((await headerOf(id)).acceptedByName).toBe('Waterkant Property Group');
	});

	it('declines, with the reason the client gave', async () => {
		const id = await draftReadyToSend();
		const { token } = await send(id);

		expect(
			await answerSharedQuote(token, 'declined', { reason: 'Going with someone local' })
		).toEqual({
			ok: true
		});

		const row = await headerOf(id);
		expect(row.status).toBe('declined');
		expect(row.declineReason).toBe('Going with someone local');
	});

	it('writes an event for every transition', async () => {
		const id = await draftReadyToSend();
		const { token } = await send(id);
		await openSharedQuote(token);
		await answerSharedQuote(token, 'accepted', { name: 'Renske Malan' });

		const events = await runScoped(thornhill.id, owner.id, (tx) =>
			tx.select().from(quoteEvent).where(eq(quoteEvent.quoteId, id))
		);

		expect(events.map((e) => e.kind).sort()).toEqual(['accepted', 'sent', 'viewed']);
		for (const event of events) expect(event.occurredAt).toBeInstanceOf(Date);
	});
});

describe('an expired quote', () => {
	it('can still be read, and cannot be accepted', async () => {
		// Sent with a valid-until in the past. The send itself does not care — a quote may be
		// re-sent with a short window — and the client-facing side is where the date bites.
		const id = await draftReadyToSend('2020-01-01');
		const { token } = await send(id);

		const shared = await openSharedQuote(token);
		expect(shared).not.toBeNull();
		// Viewable: the client should still be able to read what they were offered.
		expect(shared!.document.lines).toHaveLength(1);
		expect(shared!.status).toBe('expired');
		expect(shared!.canAnswer).toBe(false);

		const answer = await answerSharedQuote(token, 'accepted', { name: 'Too late' });
		expect(answer.ok).toBe(false);
		expect(answer.ok === false && answer.message).toContain('valid-until');

		// And nothing moved.
		expect((await headerOf(id)).status).not.toBe('accepted');
	});
});
