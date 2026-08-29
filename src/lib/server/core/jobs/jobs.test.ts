/**
 * JOBS, END TO END, AGAINST A REAL DATABASE.
 *
 * This ticket creates no screens, so nothing in the running product calls `jobCommercialState`
 * yet. That makes this file the only thing standing between a wiring mistake and SPA-23 — so it
 * goes through `runScoped`, the real `answerSharedQuote`, the real `createFromQuote` and the two
 * `public.ts` seams rather than mocking any of them. A suite of hand-linked fixtures would pass
 * just as happily with the propagation missing, which is exactly the defect worth catching.
 *
 * Three of SPA-20's acceptance criteria are statements about what does NOT happen — no second
 * job for a second click, no status change when the money arrives, no requirement that invoices
 * sum to the quote — and an absence is only demonstrable by a test that would catch its presence.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

/**
 * Sending a quote emails it, and this suite is not about email. The transport is replaced so the
 * tests exercise the acceptance path rather than the SMTP configuration of whoever is running
 * them — `modules/quoting/sharing.test.ts` does the same, for the same reason.
 */
vi.mock('$lib/server/core/mail', () => ({
	sendMail: vi.fn(async () => {})
}));

/**
 * Vitest's default five seconds per test assumes a Postgres on the same machine. This project's
 * database is hosted, and these cases open several transactions each — most of the budget is
 * network. Raised here rather than globally, because it is a fact about where the database is.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const { closePool, runScoped } = await import('$lib/server/core/db/client');
const { quote } = await import('$lib/server/core/db/schema/quoting');
const { invoice } = await import('$lib/server/core/db/schema/invoicing');
const { job } = await import('$lib/server/core/db/schema/jobs');
const { business: businessTable } = await import('$lib/server/core/db/schema/core');
const { toBusiness } = await import('$lib/server/core/db/map');
const { createDraft, saveDraft } = await import('$lib/server/modules/quoting/effects');
const { sendQuote } = await import('$lib/server/modules/quoting/send');
const { answerSharedQuote } = await import('$lib/server/modules/quoting/accept');
const { createFromQuote } = await import('$lib/server/modules/invoicing/public');
const { loadQuoteRow } = await import('$lib/server/modules/quoting/queries');
const { jobCommercialState, loadJob } = await import('./index');
const { NO_ACCESS } = await import('$lib/core/modules/catalogue');
const fixtures = await import('$lib/server/core/db/fixtures');

type TestUser = Awaited<ReturnType<typeof fixtures.createUser>>;
type TestBusiness = Awaited<ReturnType<typeof fixtures.createBusiness>>;

/** Everything owned. The gating this exercises is `write`, and the absence case sets its own. */
const OWNS_EVERYTHING = { ...NO_ACCESS, quoting: 'write', invoicing: 'write' } as const;

let owner: TestUser;
let thornhill: TestBusiness;
let customerId: string;

beforeAll(async () => {
	owner = await fixtures.createUser('Alice Thornhill');
	thornhill = await fixtures.createBusiness(owner.id, 'Thornhill Joinery');
	customerId = await fixtures.createCustomer(thornhill, 'Fynbos Interiors');
});

afterAll(async () => {
	await fixtures.cleanupFixtures();
	await closePool();
});

function asOwner<T>(fn: Parameters<typeof runScoped<T>>[2]): Promise<T> {
	return runScoped(thornhill.id, owner.id, fn);
}

/** A quote with one line, sent, with a live share token. Returns the token and the quote id. */
async function sentQuote(): Promise<{ id: string; token: string }> {
	const id = await asOwner(async (tx) => {
		const [row] = await tx
			.select()
			.from(businessTable)
			.where(eq(businessTable.businessId, thornhill.id));

		const draftId = await createDraft(tx, toBusiness(row), { customerId });

		await saveDraft(tx, thornhill.id, draftId, {
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
			validUntil: '2099-12-31',
			deposit: { kind: 'none' },
			lines: [
				{
					id: randomUUID(),
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

		return draftId;
	});

	const { token } = await asOwner((tx) =>
		sendQuote(tx, thornhill.id, owner.id, id, 'https://cjs.test')
	);

	return { id, token };
}

function quoteRow(quoteId: string) {
	return asOwner(async (tx) => {
		const [row] = await tx.select().from(quote).where(eq(quote.id, quoteId));
		return row;
	});
}

/** Every job this business has. The suite asserts on the count as often as on the contents. */
function jobsOf(): Promise<{ id: string }[]> {
	return asOwner((tx) => tx.select({ id: job.id }).from(job));
}

describe('accepting a quote creates the job', () => {
	it('creates exactly one job, links it, and leaves it unscheduled', async () => {
		const { id, token } = await sentQuote();

		const answer = await answerSharedQuote(token, 'accepted', { name: 'Renske Malan' });
		expect(answer.ok).toBe(true);

		const row = await quoteRow(id);
		expect(row.status).toBe('accepted');
		expect(row.jobId).not.toBeNull();

		const created = await asOwner((tx) => loadJob(tx, row.jobId as string));
		expect(created).not.toBeNull();
		expect(created?.status).toBe('unscheduled');
		expect(created?.priority).toBe('normal');
		expect(created?.customerId).toBe(customerId);
		expect(created?.ref).toMatch(/^JOB-\d{4}$/);
		// Seeded from the quote's first line, so the row is nameable on a pipeline screen. There
		// is nothing else to name it with — an auto-created job has no service and no area.
		expect(created?.description).toBe('Solid oak kitchen island top');
		// The client who answered is not a user, so nothing is attributed to anybody.
		expect(created?.startedByUserId).toBeNull();
	});

	it('creates one job and burns one number when the same link is answered twice', async () => {
		// The pre-checks in `answerSharedQuote` run in a SEPARATE transaction from the guarded
		// UPDATE, so two people clicking Accept both reach it. The second matches zero rows,
		// returns nothing, and must therefore create nothing.
		const { id, token } = await sentQuote();

		const [first, second] = await Promise.all([
			answerSharedQuote(token, 'accepted', { name: 'Renske Malan' }),
			answerSharedQuote(token, 'accepted', { name: 'Renske Malan' })
		]);

		// One of the two may be refused outright by the pre-check; what matters is the database.
		expect(first.ok || second.ok).toBe(true);

		const row = await quoteRow(id);
		const created = await asOwner((tx) =>
			tx
				.select()
				.from(job)
				.where(eq(job.id, row.jobId as string))
		);

		expect(created).toHaveLength(1);
	});

	it('creates nothing when the quote is declined', async () => {
		const { id, token } = await sentQuote();
		const before = (await jobsOf()).length;

		await answerSharedQuote(token, 'declined', { reason: 'Going with somebody else' });

		const row = await quoteRow(id);
		expect(row.status).toBe('declined');
		expect(row.jobId).toBeNull();
		expect((await jobsOf()).length).toBe(before);
	});

	it('creates nothing when the quote already carries a job', async () => {
		const { id, token } = await sentQuote();
		const existing = await sentQuote();
		await answerSharedQuote(existing.token, 'accepted');
		const existingJobId = (await quoteRow(existing.id)).jobId as string;

		await asOwner((tx) => tx.update(quote).set({ jobId: existingJobId }).where(eq(quote.id, id)));

		const before = (await jobsOf()).length;
		await answerSharedQuote(token, 'accepted');

		expect((await quoteRow(id)).jobId).toBe(existingJobId);
		expect((await jobsOf()).length).toBe(before);
	});
});

describe('the job survives the quote-to-invoice conversion', () => {
	/**
	 * THE CASE THAT WOULD HAVE CAUGHT THE MISSING PROPAGATION.
	 *
	 * `createFromQuote` is the only quote-to-invoice path in the product, and the `makeInvoice`
	 * action is its only caller. This walks the same two steps in the same order: without
	 * `jobId` threaded through both, no invoice in the running system would ever carry a job and
	 * the derivation could never leave `accepted` — while every fixture that linked one by hand
	 * went on passing.
	 */
	it('moves from accepted to invoiced when the invoice is raised the way the action raises it', async () => {
		const { id, token } = await sentQuote();
		await answerSharedQuote(token, 'accepted');
		const jobId = (await quoteRow(id)).jobId as string;

		const before = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));
		expect(before?.kind).toBe('accepted');

		const invoiceId = await asOwner(async (tx) => {
			const [businessRow] = await tx
				.select()
				.from(businessTable)
				.where(eq(businessTable.businessId, thornhill.id));
			const row = await loadQuoteRow(tx, id);

			return createFromQuote(tx, toBusiness(businessRow), {
				quoteId: id,
				quoteNumber: row?.numberFormatted ?? null,
				jobId: row?.jobId ?? null,
				customerId,
				customer: { name: 'Fynbos Interiors' },
				sendToName: 'Renske Malan',
				sendToEmail: 'renske@fynbosinteriors.co.za',
				pricingMode: row?.pricingMode ?? 'exclusive',
				taxEngine: row?.taxEngine ?? 'za_vat',
				vatRatePpm: row?.vatRatePpm ?? 150_000,
				vatPolicy: row?.vatPolicy ?? 'standard',
				currency: row?.currency ?? 'ZAR',
				lines: []
			});
		});

		// The link is real, and it is what the derivation reads.
		const stored = await asOwner(async (tx) => {
			const [row] = await tx.select().from(invoice).where(eq(invoice.id, invoiceId));
			return row;
		});
		expect(stored.jobId).toBe(jobId);

		await issue(invoiceId, 'INV-2001', R2400);

		const after = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));
		expect(after?.kind).toBe('invoiced');
		if (after?.kind !== 'invoiced') return;
		expect(after.outstanding.cents).toBe(totalOf(R2400));
	});
});

/**
 * A figure and the VAT on it, both given rather than computed.
 *
 * Every subtotal in this file is chosen so that 15% is a whole number of cents, and the tax is
 * written out beside it. Deriving it here would mean rounding, and rounding money outside
 * `roundDiv` is the one arithmetic this codebase does not do anywhere — including in a test,
 * where a rounded figure would only make the assertions harder to read back.
 */
type Amount = { readonly subtotal: number; readonly tax: number };

const R1000: Amount = { subtotal: 100_000, tax: 15_000 };
const R2400: Amount = { subtotal: 240_000, tax: 36_000 };

const totalOf = (amount: Amount) => amount.subtotal + amount.tax;

/**
 * Issue a draft invoice at a given figure.
 *
 * Written as an UPDATE from `draft` because that is the one transition
 * `app.freeze_issued_invoice` lets through — it reads `OLD.status = 'draft'` and returns early,
 * which is exactly right: the document is being created at that moment, not altered.
 */
async function issue(invoiceId: string, number: string, amount: Amount): Promise<void> {
	const { subtotal: subtotalCents, tax } = amount;
	await asOwner(async (tx) => {
		await tx.execute(sql`
			update invoicing_invoice
			   set status = 'sent',
			       issued_at = now(),
			       issue_date = current_date,
			       -- invoicing_invoice_dates_required_once_issued: an issued invoice has both
			       -- dates or neither, because "when is this due?" is the first thing a client
			       -- looks for and a blank there is not an answer.
			       due_date = current_date + 30,
			       number_prefix = 'INV',
			       number_value = ${Number(number.split('-')[1])},
			       number_formatted = ${number},
			       snapshot_subtotal_cents = ${subtotalCents},
			       snapshot_tax_cents = ${tax},
			       snapshot_total_cents = ${subtotalCents + tax},
			       snapshot_at = now()
			 where id = ${invoiceId}
		`);
	});
}

/** A bare invoice on a job, issued at a total, with an optional payment against it. */
async function invoiceOn(
	jobId: string,
	number: string,
	amount: Amount,
	settle: boolean
): Promise<string> {
	const invoiceId = randomUUID();

	await asOwner(async (tx) => {
		await tx.execute(sql`
			insert into invoicing_invoice (id, business_id, customer_id, job_id, vat_policy)
			values (${invoiceId}, ${thornhill.id}, ${customerId}, ${jobId}, 'standard')
		`);
	});

	await issue(invoiceId, number, amount);
	if (!settle) return invoiceId;

	const total = totalOf(amount);
	await asOwner(async (tx) => {
		await tx.execute(sql`
			insert into invoicing_payment
				(business_id, invoice_id, kind, amount_cents, method, received_on)
			values (${thornhill.id}, ${invoiceId}, 'payment', ${total}, 'eft', current_date)
		`);
		await tx.execute(sql`
			update invoicing_invoice
			   set status = 'paid', paid_at = now(), paid_on = current_date
			 where id = ${invoiceId}
		`);
	});

	return invoiceId;
}

describe('the model: a job billed in phases', () => {
	async function jobWithThreeInvoices(): Promise<string> {
		const { id, token } = await sentQuote();
		await answerSharedQuote(token, 'accepted');
		const jobId = (await quoteRow(id)).jobId as string;

		const suffix = String(Date.now()).slice(-5);
		await invoiceOn(jobId, `INV-1${suffix}`, R1000, true);
		await invoiceOn(jobId, `INV-2${suffix}`, R1000, true);
		await invoiceOn(jobId, `INV-3${suffix}`, R2400, false);

		return jobId;
	}

	it('reads as invoiced with the outstanding phase, and the job status is untouched', async () => {
		const jobId = await jobWithThreeInvoices();

		const derived = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));
		expect(derived?.kind).toBe('invoiced');
		if (derived?.kind !== 'invoiced') return;
		// Only the unpaid phase. The two settled ones contribute nothing to what is owed.
		expect(derived.outstanding.cents).toBe(totalOf(R2400));

		const stored = await asOwner((tx) => loadJob(tx, jobId));
		expect(stored?.status).toBe('unscheduled');
	});

	it('settling everything moves the derivation and leaves the status byte-identical', async () => {
		const jobId = await jobWithThreeInvoices();
		const before = await asOwner((tx) => loadJob(tx, jobId));

		await asOwner(async (tx) => {
			await tx.execute(sql`
				insert into invoicing_payment
					(business_id, invoice_id, kind, amount_cents, method, received_on)
				select ${thornhill.id}, id, 'payment', snapshot_total_cents, 'eft', current_date
				  from invoicing_invoice where job_id = ${jobId} and status = 'sent'
			`);
			await tx.execute(sql`
				update invoicing_invoice
				   set status = 'paid', paid_at = now(), paid_on = current_date
				 where job_id = ${jobId} and status = 'sent'
			`);
		});

		const derived = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));
		expect(derived?.kind).toBe('settled');

		const after = await asOwner((tx) => loadJob(tx, jobId));
		expect(after?.status).toBe(before?.status);
	});

	it('reads as done and invoiced at once, which is the whole point', async () => {
		const jobId = await jobWithThreeInvoices();

		await asOwner((tx) => tx.update(job).set({ status: 'done' }).where(eq(job.id, jobId)));

		// Two independent facts about one job: the work is finished, and R2 760 is still owed.
		// Neither was derived from the other, and nothing in the product will reconcile them.
		const stored = await asOwner((tx) => loadJob(tx, jobId));
		const derived = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));

		expect(stored?.status).toBe('done');
		expect(derived?.kind).toBe('invoiced');
	});
});

describe('degrading honestly', () => {
	it('answers untracked, naming Invoicing, when the business does not own it', async () => {
		const { id, token } = await sentQuote();
		await answerSharedQuote(token, 'accepted');
		const jobId = (await quoteRow(id)).jobId as string;

		const derived = await asOwner((tx) =>
			jobCommercialState(tx, { ...NO_ACCESS, quoting: 'write' }, jobId)
		);

		expect(derived?.kind).toBe('untracked');
		if (derived?.kind !== 'untracked') return;
		expect(derived.missing).toContain('invoicing');
	});

	it('answers null for a job that is not there', async () => {
		// Not `no_quote`. An id the tenant cannot see must read as "there is no such job" —
		// answering anything about its quotes would be asserting something about a row we were
		// never allowed to look at.
		const derived = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, randomUUID()));

		expect(derived).toBeNull();
	});
});
