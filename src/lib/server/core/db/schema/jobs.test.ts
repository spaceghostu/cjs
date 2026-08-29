/**
 * THE GUARANTEES ONLY A REAL POSTGRES CAN GIVE.
 *
 * `scripts/invariants.sql` checks three things about every table on this floor — `business_id`
 * is `uuid NOT NULL`, row level security is both ENABLED and FORCED, and the application role
 * holds no DELETE or TRUNCATE. It checks all three for `core_job`, and it passes.
 *
 * What it does NOT do is read `pg_policy`. A `tenant_isolation` policy that was never created,
 * or created with the wrong expression, fails CLOSED — every query returns nothing, every screen
 * is empty, and `db:verify` still says the platform invariants hold. The only thing in this
 * repository that proves the policy BODY is the cross-tenant pair below, and because a missing
 * policy would make every refusal pass for the wrong reason, the first case asserts a positive
 * read before any of them.
 *
 * Everything else here is the same class of claim: a CHECK constraint, a unique index, a
 * composite foreign key and a withheld grant are properties of the DATABASE, and the honest way
 * to assert a property of the database is to ask the database.
 */
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { closePool, runScoped } from '../client';
import {
	cleanupFixtures,
	createBusiness,
	createCustomer,
	createUser,
	messageFromRejection,
	type TestBusiness
} from '../fixtures';
import { allocateDocumentNumber } from '../numbering';

/**
 * Vitest's default five seconds per test assumes a Postgres on the same machine. This project's
 * database is hosted, so a single round trip costs a couple of hundred milliseconds and a test
 * that opens three transactions spends nearly all of its budget waiting on the network. The
 * limits are raised here rather than globally because this is a fact about where the database
 * is, not about what these tests do — every one of them is a handful of statements.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

type Seeded = { business: TestBusiness; customerId: string; jobId: string };

/**
 * TWO BUSINESSES FOR THE WHOLE SUITE, rather than a fresh pair per case.
 *
 * Nothing here needs a private tenant — every case is about what the database refuses, and the
 * refusals do not interact. What a fresh pair per case would cost is a dozen round trips each,
 * and a teardown that has to unwind twenty tenants instead of two.
 *
 * Every case that inserts a job supplies its own number, so nothing collides on
 * `core_job_number_unique` by accident — which is itself one of the things being tested.
 */
let mine: Seeded;
let theirs: Seeded;

async function seedBusiness(tradingName: string, ref: string): Promise<Seeded> {
	const owner = await createUser();
	const business = await createBusiness(owner.id, tradingName);
	const customerId = await createCustomer(business);
	const jobId = randomUUID();

	await runScoped(business.id, owner.id, async (tx) => {
		await tx.execute(sql`
			insert into core_job
				(id, business_id, customer_id, number_prefix, number_value, number_formatted, service)
			values (${jobId}, ${business.id}, ${customerId}, 'JOB', 1, ${ref}, 'Kitchen fit')
		`);
	});

	return { business, customerId, jobId };
}

beforeAll(async () => {
	mine = await seedBusiness('Thornhill Joinery', 'JOB-0001');
	theirs = await seedBusiness('Bayside Plumbing', 'JOB-0001');
});

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

/** The owner of a seeded business, acting for it. */
function as<T>(seeded: Seeded, fn: Parameters<typeof runScoped<T>>[2]): Promise<T> {
	return runScoped(seeded.business.id, seeded.business.ownerUserId, fn);
}

describe('a job belongs to exactly one business', () => {
	it('is visible to the business that owns it', async () => {
		// Asserted FIRST, and deliberately: every refusal below would also "pass" against a table
		// nobody can read at all, so the suite has to show that the policy admits the owner
		// before it can mean anything by showing that it refuses everybody else.
		const rows = await as(mine, async (tx) => {
			const result = await tx.execute(sql`select id from core_job where id = ${mine.jobId}`);
			return result.rows;
		});

		expect(rows).toHaveLength(1);
	});

	it('cannot be read by another business', async () => {
		const rows = await as(theirs, async (tx) => {
			const result = await tx.execute(sql`select id from core_job where id = ${mine.jobId}`);
			return result.rows;
		});

		expect(rows).toHaveLength(0);
	});

	it('cannot be updated by another business', async () => {
		const affected = await as(theirs, async (tx) => {
			const result = await tx.execute(
				sql`update core_job set status = 'cancelled' where id = ${mine.jobId}`
			);
			return result.rowCount;
		});

		expect(affected).toBe(0);

		// And the row it could not reach is untouched, which is the half that would still be
		// true if the update had silently landed somewhere else.
		const status = await as(mine, async (tx) => {
			const result = await tx.execute<{ status: string }>(
				sql`select status from core_job where id = ${mine.jobId}`
			);
			return result.rows[0].status;
		});

		expect(status).toBe('unscheduled');
	});

	it('has row level security both enabled and forced', async () => {
		// ENABLE alone leaves the table's OWNER exempt, and migrations run as the owner. Both
		// flags, or the policy is advisory for the one role that can do the most damage.
		const flags = await as(mine, async (tx) => {
			const result = await tx.execute<{ enabled: boolean; forced: boolean }>(sql`
				select relrowsecurity as enabled, relforcerowsecurity as forced
				  from pg_class where relname = 'core_job'
			`);
			return result.rows[0];
		});

		expect(flags).toEqual({ enabled: true, forced: true });
	});
});

describe('the vocabulary is closed', () => {
	it('refuses a status that is not a job status', async () => {
		const message = await messageFromRejection(
			as(mine, async (tx) => {
				await tx.execute(sql`
					insert into core_job
						(business_id, customer_id, number_prefix, number_value, number_formatted, status)
					values (${mine.business.id}, ${mine.customerId}, 'JOB', 90, 'JOB-0090', 'quoted')
				`);
			})
		);

		// Named, not merely rejected: `'quoted'` is precisely the commercial value SPA-20 exists
		// to keep out of this column, and the constraint that refuses it is the one that matters.
		expect(message).toContain('core_job_status_known');
	});

	it('refuses a priority that is not a job priority', async () => {
		const message = await messageFromRejection(
			as(mine, async (tx) => {
				await tx.execute(sql`
					insert into core_job
						(business_id, customer_id, number_prefix, number_value, number_formatted, priority)
					values (${mine.business.id}, ${mine.customerId}, 'JOB', 91, 'JOB-0091', 'whenever')
				`);
			})
		);

		expect(message).toContain('core_job_priority_known');
	});
});

describe('a job number means one job', () => {
	it('refuses a second job with the same number in one business', async () => {
		const message = await messageFromRejection(
			as(mine, async (tx) => {
				await tx.execute(sql`
					insert into core_job
						(business_id, customer_id, number_prefix, number_value, number_formatted)
					values (${mine.business.id}, ${mine.customerId}, 'JOB', 1, 'JOB-0001')
				`);
			})
		);

		expect(message).toContain('core_job_number_unique');
	});

	it('allows the same number in a different business', async () => {
		// Each business counts from one. `JOB-0001` is not globally unique and must not be — two
		// joineries both having a first job is the ordinary case, and both were seeded with it.
		const rows = await as(theirs, async (tx) => {
			const result = await tx.execute(
				sql`select id from core_job where number_formatted = 'JOB-0001'`
			);
			return result.rows;
		});

		expect(rows).toHaveLength(1);
	});

	it('allocates JOB-0001 then JOB-0002 from the shared counter', async () => {
		// Also the case that catches a `core_document_number_type_known` CHECK that was not
		// widened to include `'job'`: the counter row would be refused outright, and refused for
		// the first time inside a client's quote acceptance.
		await as(theirs, async (tx) => {
			expect((await allocateDocumentNumber(tx, 'job')).formatted).toBe('JOB-0001');
			expect((await allocateDocumentNumber(tx, 'job')).formatted).toBe('JOB-0002');
		});
	});
});

describe('a job is archived, never deleted', () => {
	it('refuses DELETE to the application role', async () => {
		const message = await messageFromRejection(
			as(mine, async (tx) => {
				await tx.execute(sql`delete from core_job where id = ${mine.jobId}`);
			})
		);

		expect(message).toMatch(/permission denied/i);
	});
});

describe('the acceptance path can write without a user', () => {
	it('accepts an INSERT inside runScoped(businessId, null, ...)', async () => {
		// The exact shape `actAsSharedTenant` produces: a tenant resolved from a share token and
		// no user at all, because the client answering an emailed link genuinely is not one.
		const created = randomUUID();

		await runScoped(mine.business.id, null, async (tx) => {
			await tx.execute(sql`
				insert into core_job
					(id, business_id, customer_id, number_prefix, number_value, number_formatted)
				values (${created}, ${mine.business.id}, ${mine.customerId}, 'JOB', 92, 'JOB-0092')
			`);
		});

		const rows = await as(mine, async (tx) => {
			const result = await tx.execute(sql`select id from core_job where id = ${created}`);
			return result.rows;
		});

		expect(rows).toHaveLength(1);
	});
});

describe("a document cannot be linked to another tenant's job", () => {
	/**
	 * The reason the foreign key is composite.
	 *
	 * Postgres performs referential integrity with row security BYPASSED, so a single-column
	 * `job_id -> core_job(id)` would accept this silently: every screen would still look correct,
	 * and the link underneath would cross a tenant boundary.
	 *
	 * Note that `quoting_quote.customer_id` predates this idiom and is NOT composite, so it is
	 * still open to the same assignment. Retrofitting it is a separate, larger decision; the
	 * inconsistency is acknowledged here rather than implied safe.
	 */
	it("refuses a quote pointing at another business's job", async () => {
		const quoteId = randomUUID();

		await as(mine, async (tx) => {
			await tx.execute(sql`
				insert into quoting_quote (id, business_id, customer_id, vat_policy)
				values (${quoteId}, ${mine.business.id}, ${mine.customerId}, 'standard')
			`);
		});

		const message = await messageFromRejection(
			as(mine, async (tx) => {
				await tx.execute(
					sql`update quoting_quote set job_id = ${theirs.jobId} where id = ${quoteId}`
				);
			})
		);

		expect(message).toContain('quoting_quote_job_fk');

		// The same statement with this tenant's own job is accepted, so the refusal above is
		// about the tenant boundary rather than about the column being unwritable.
		const linked = await as(mine, async (tx) => {
			await tx.execute(sql`update quoting_quote set job_id = ${mine.jobId} where id = ${quoteId}`);
			const result = await tx.execute<{ job_id: string }>(
				sql`select job_id from quoting_quote where id = ${quoteId}`
			);
			return result.rows[0].job_id;
		});

		expect(linked).toBe(mine.jobId);
	});

	it("refuses an invoice pointing at another business's job", async () => {
		const invoiceId = randomUUID();

		await as(mine, async (tx) => {
			await tx.execute(sql`
				insert into invoicing_invoice (id, business_id, customer_id, vat_policy)
				values (${invoiceId}, ${mine.business.id}, ${mine.customerId}, 'standard')
			`);
		});

		const message = await messageFromRejection(
			as(mine, async (tx) => {
				await tx.execute(
					sql`update invoicing_invoice set job_id = ${theirs.jobId} where id = ${invoiceId}`
				);
			})
		);

		expect(message).toContain('invoicing_invoice_job_fk');
	});
});
