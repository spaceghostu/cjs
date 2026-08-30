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
import { and, eq, sql } from 'drizzle-orm';
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
const { quote, quoteEvent } = await import('$lib/server/core/db/schema/quoting');
const { invoice } = await import('$lib/server/core/db/schema/invoicing');
const { job } = await import('$lib/server/core/db/schema/jobs');
const { business: businessTable, documentNumber } = await import('$lib/server/core/db/schema/core');

const { toBusiness } = await import('$lib/server/core/db/map');
const { createDraft, saveDraft } = await import('$lib/server/modules/quoting/effects');
const { sendQuote } = await import('$lib/server/modules/quoting/send');
const { answerSharedQuote } = await import('$lib/server/modules/quoting/accept');
const { createFromQuote } = await import('$lib/server/modules/invoicing/public');
// Reached past `public.ts` deliberately: cancelling is not something outside Invoicing may do,
// so it is not on the front door and should not be put there for a test. This file already
// imports Quoting's `effects` directly for the same reason — a fixture is allowed to use the
// module's own machinery to arrive at a state the product can genuinely reach.
const { cancelInvoice } = await import('$lib/server/modules/invoicing/effects');
const { loadQuoteRow } = await import('$lib/server/modules/quoting/queries');
const { jobCommercialState, listJobs, loadJob } = await import('./index');
const { NO_ACCESS } = await import('$lib/core/modules/catalogue');
const fixtures = await import('$lib/server/core/db/fixtures');

type TestUser = Awaited<ReturnType<typeof fixtures.createUser>>;
type TestBusiness = Awaited<ReturnType<typeof fixtures.createBusiness>>;

/** Everything owned. The gating this exercises is `write`, and the absence case sets its own. */
const OWNS_EVERYTHING = { ...NO_ACCESS, quoting: 'write', invoicing: 'write' } as const;

/**
 * `DEFAULTS.job.start` in `db/numbering.ts`, repeated because that table is private to the
 * module that owns it. Only read when this business has not allocated a job number yet.
 */
const JOB_SEQUENCE_START = 1;

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

/**
 * The number the next job will be given.
 *
 * Read straight off the shared counter rather than inferred from the highest `JOB-` reference in
 * the table, because those two disagree in precisely the case worth catching: a job that was
 * allocated a number and then not created still moves this column. `next_value` is what a
 * duplicate acceptance would move twice.
 *
 * The counter row does not exist until this business's first allocation, so an absent row reads
 * as the sequence's own starting point — `DEFAULTS.job.start` in `db/numbering.ts` — which is
 * the number the next allocation would in fact hand out. Written that way rather than assuming
 * an earlier test in this file has already created the row, because a suite that only passes in
 * file order is a suite that fails the first time somebody runs one case on its own.
 */
async function jobCounter(): Promise<number> {
	const [row] = await asOwner((tx) =>
		tx
			.select({ nextValue: documentNumber.nextValue })
			.from(documentNumber)
			.where(eq(documentNumber.docType, 'job'))
	);

	return row?.nextValue ?? JOB_SEQUENCE_START;
}

/** The `accepted` lines on one quote's timeline. One acceptance must produce exactly one. */
async function acceptedEventsOn(quoteId: string): Promise<number> {
	const rows = await asOwner((tx) =>
		tx
			.select({ id: quoteEvent.id })
			.from(quoteEvent)
			.where(and(eq(quoteEvent.quoteId, quoteId), eq(quoteEvent.kind, 'accepted')))
	);

	return rows.length;
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
		//
		// ALL THREE COUNTS ARE TAKEN BEFORE AND AFTER, and none of them may be replaced by a
		// lookup of the job the quote ended up pointing at. A second job created by the losing
		// click would be linked by a second `update quote set job_id`, so the quote would carry
		// one of the two ids and a by-id read would find exactly one row no matter how many were
		// written — the stray job and its burnt number would sit in the database unnoticed. The
		// whole acceptance criterion is a statement about totals, so totals are what is counted.
		const { id, token } = await sentQuote();
		const jobsBefore = (await jobsOf()).length;
		const numberBefore = await jobCounter();
		const eventsBefore = await acceptedEventsOn(id);

		const [first, second] = await Promise.all([
			answerSharedQuote(token, 'accepted', { name: 'Renske Malan' }),
			answerSharedQuote(token, 'accepted', { name: 'Renske Malan' })
		]);

		// One of the two may be refused outright by the pre-check; what matters is the database.
		expect(first.ok || second.ok).toBe(true);

		const row = await quoteRow(id);
		expect(row.status).toBe('accepted');
		expect(row.jobId).not.toBeNull();

		// One acceptance, one job.
		expect((await jobsOf()).length).toBe(jobsBefore + 1);
		// One acceptance, one number off the shared counter. A `JOB-` number that was allocated
		// and then abandoned is a gap `numbering.ts` calls acceptable but nobody asked for.
		expect(await jobCounter()).toBe(numberBefore + 1);
		// One acceptance, one line on the timeline. The client answered once and the history
		// must say so once.
		expect(await acceptedEventsOn(id)).toBe(eventsBefore + 1);
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

describe('listing jobs', () => {
	/**
	 * `listJobs` has no caller yet — SPA-23's pipeline screen is the one it was written for — so
	 * without this case its status filter, its archived exclusion and its limit would ship
	 * unexecuted, and the first person to rely on them would be the first person to run them.
	 *
	 * MEMBERSHIP, NEVER COUNTS. Every case in this file accepts quotes against the same business
	 * and the jobs accumulate, so an assertion on the length of this list would pass or fail on
	 * the order the suite happened to run in. What is asserted is that a known job is in the
	 * answer when it should be and out of it when it should not.
	 */
	async function acceptedJob(): Promise<string> {
		const { id, token } = await sentQuote();
		await answerSharedQuote(token, 'accepted');
		return (await quoteRow(id)).jobId as string;
	}

	const idsOf = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

	it('returns a job under its own status and not under another', async () => {
		const jobId = await acceptedJob();

		const unscheduled = await asOwner((tx) => listJobs(tx, { statuses: ['unscheduled'] }));
		expect(idsOf(unscheduled)).toContain(jobId);

		const done = await asOwner((tx) => listJobs(tx, { statuses: ['done'] }));
		expect(idsOf(done)).not.toContain(jobId);
	});

	it('carries the reference and the customer a pipeline row needs', async () => {
		const jobId = await acceptedJob();

		const rows = await asOwner((tx) => listJobs(tx, { statuses: ['unscheduled'] }));
		const row = rows.find((candidate) => candidate.id === jobId);

		expect(row).toBeDefined();
		expect(row?.ref).toMatch(/^JOB-\d{4}$/);
		expect(row?.customerId).toBe(customerId);
		// Auto-created, so neither was typed by anybody. Asserted so that a later change which
		// starts guessing them has to come past this line.
		expect(row?.service).toBeNull();
		expect(row?.area).toBeNull();
	});

	it('leaves an archived job out, with no status filter to hide behind', async () => {
		const jobId = await acceptedJob();

		// No `statuses`, so this is the unfiltered branch: the archived exclusion is the only
		// thing that can remove the row, and the job's status has not moved.
		expect(idsOf(await asOwner((tx) => listJobs(tx)))).toContain(jobId);

		await asOwner((tx) => tx.update(job).set({ archivedAt: new Date() }).where(eq(job.id, jobId)));

		expect(idsOf(await asOwner((tx) => listJobs(tx)))).not.toContain(jobId);
		// And `loadJob` agrees, which is what makes archiving one answer rather than two.
		expect(await asOwner((tx) => loadJob(tx, jobId))).toBeNull();
	});

	it('honours a limit, so a caller that asks for one row gets one', async () => {
		await acceptedJob();
		await acceptedJob();

		const rows = await asOwner((tx) => listJobs(tx, { limit: 1 }));
		expect(rows).toHaveLength(1);
	});
});

describe('which invoices count as money owed', () => {
	/**
	 * THE CASE THAT HOLDS THE STATUS FILTER IN PLACE.
	 *
	 * `invoicesForJob` admits only `sent`, `viewed` and `paid`, and that one clause is the only
	 * thing keeping withdrawn money out of a job's figures. A DRAFT has a second shield — it
	 * carries no snapshot total, so the null check below the query drops it anyway — but a
	 * CANCELLED invoice keeps every figure it was issued with. Delete the filter and this job
	 * would read "R2 400 still owed" on a claim the business itself withdrew.
	 *
	 * The cancellation goes through the real `cancelInvoice` rather than an UPDATE of `status`,
	 * and not out of purity: `invoicing_invoice_cancelled_has_date` requires `cancelled_at` to
	 * be set in the same statement, so the shortest hand-written version of this fixture does
	 * not survive contact with the database.
	 */
	it('excludes a cancelled invoice from both sums, and counts the live one in full', async () => {
		const { id, token } = await sentQuote();
		await answerSharedQuote(token, 'accepted');
		const jobId = (await quoteRow(id)).jobId as string;

		const suffix = String(Date.now()).slice(-5);
		await invoiceOn(jobId, `INV-4${suffix}`, R2400, false);
		const withdrawn = await invoiceOn(jobId, `INV-5${suffix}`, R1000, false);

		// Both are live at this point, so the job is owed the pair. Asserted first so that the
		// case below is a statement about the cancellation and not about the fixture.
		const both = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));
		expect(both?.kind).toBe('invoiced');
		if (both?.kind !== 'invoiced') return;
		expect(both.outstanding.cents).toBe(totalOf(R2400) + totalOf(R1000));

		await asOwner((tx) =>
			cancelInvoice(tx, thornhill.id, owner.id, withdrawn, 'Client changed the scope')
		);

		const derived = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));
		expect(derived?.kind).toBe('invoiced');
		if (derived?.kind !== 'invoiced') return;
		// The figures, not just the kind: adding 'cancelled' back to the filter would leave the
		// kind exactly as it is here and only the amounts would move.
		expect(derived.outstanding.cents).toBe(totalOf(R2400));
		expect(derived.invoiced.cents).toBe(totalOf(R2400));
	});

	it('reads as settled when the only live invoice is paid and the rest were withdrawn', async () => {
		// `settled` is "at least one invoice, and nothing outstanding". A cancelled invoice must
		// not be the one that satisfies "at least one" either — the job below is settled because
		// R1 000 was actually paid, not because two documents exist.
		const { id, token } = await sentQuote();
		await answerSharedQuote(token, 'accepted');
		const jobId = (await quoteRow(id)).jobId as string;

		const suffix = String(Date.now()).slice(-5);
		await invoiceOn(jobId, `INV-6${suffix}`, R1000, true);
		const withdrawn = await invoiceOn(jobId, `INV-7${suffix}`, R2400, false);

		await asOwner((tx) =>
			cancelInvoice(tx, thornhill.id, owner.id, withdrawn, 'Duplicated in error')
		);

		const derived = await asOwner((tx) => jobCommercialState(tx, OWNS_EVERYTHING, jobId));
		expect(derived?.kind).toBe('settled');
		if (derived?.kind !== 'settled') return;
		expect(derived.invoiced.cents).toBe(totalOf(R1000));
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
