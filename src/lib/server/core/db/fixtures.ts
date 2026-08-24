/**
 * TEST FIXTURES. Not part of the product.
 *
 * Import-banned outside `*.test.ts` by ESLint (architecture zone 10), because everything in
 * here connects as the DDL role and deletes rows — two things the application must never be
 * able to do. It lives beside the code it exercises rather than in a `test/` tree so that a
 * schema change and the fixture that builds a row of it are edited together.
 *
 * Teardown is the awkward part and worth explaining. The application role has no DELETE
 * anywhere outside `identity`, which is the point of the whole design — so cleaning up has
 * to happen on the OWNER connection. But `FORCE ROW LEVEL SECURITY` applies to the owner
 * too, so even that connection has to establish a tenant context before it can see the rows
 * it is about to remove. That is the floor working exactly as intended, and the fact that it
 * makes the test helper mildly inconvenient is the strongest evidence it is real.
 */
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { DEFAULT_BRAND, type BrandColor } from '$lib/components/theme/brand';
import { NO_ACCESS, type AccessMap } from '../entitlement';
import { runScoped, unsafeDb } from './client';
import { toBusiness, toMember } from './map';
import { user } from './schema/identity';
import { business as businessTable, member as memberTable, type MemberRole } from './schema/core';

/** Unique per process and per call, so parallel test files never collide. */
let counter = 0;
export function uniq(prefix: string): string {
	counter += 1;
	return `${prefix}-${process.pid}-${counter}-${randomUUID().slice(0, 8)}`;
}

/**
 * The message Postgres actually sent.
 *
 * Drizzle wraps every driver error in a `DrizzleQueryError` whose own message is
 * `"Failed query: <sql>"` — the part that says *why* (`permission denied for table`,
 * `new row violates row-level security policy`) is on `.cause`. Asserting against the
 * wrapper would make a test that passes whenever the query fails for ANY reason, including
 * a typo in the test's own SQL. These tests are the proof that specific defences fire, so
 * they need the specific message.
 */
export function rejectionMessage(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;
	while (current instanceof Error) {
		parts.push(current.message);
		current = current.cause;
	}
	return parts.join('\n') || String(error);
}

/** Awaits a promise that must reject, and returns the full message chain. */
export async function messageFromRejection(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		return rejectionMessage(error);
	}
	throw new Error('expected the operation to be refused, but it succeeded');
}

export type TestUser = { id: string; email: string; name: string };

export type TestBusiness = {
	id: string;
	tradingName: string;
	ownerUserId: string;
};

/** Tracks what to remove, in the order the foreign keys allow. */
const createdBusinesses: string[] = [];
const createdUsers: string[] = [];

/**
 * A row in `identity.user`. Written through `unsafeDb` because identity has no RLS and no
 * tenant column — it is the one domain that exists before any business does.
 */
export async function createUser(name = 'Test Person'): Promise<TestUser> {
	const id = uniq('user');
	const email = `${id}@example.test`;
	await unsafeDb.insert(user).values({ id, name, email, emailVerified: true });
	createdUsers.push(id);
	return { id, email, name };
}

/**
 * A business and its owner membership, created the way onboarding creates one: a
 * server-generated id, established as the transaction's tenant context BEFORE the insert,
 * so both rows satisfy the same `tenant_isolation` policy every other write does.
 *
 * There is no privileged path here. This is the real one.
 */
export async function createBusiness(
	ownerUserId: string,
	tradingName = 'Thornhill Joinery',
	brandColor: BrandColor = DEFAULT_BRAND
): Promise<TestBusiness> {
	const id = randomUUID();
	createdBusinesses.push(id);

	await runScoped(id, ownerUserId, async (tx) => {
		await tx.execute(sql`
			insert into core_business (business_id, trading_name, brand_color)
			values (${id}, ${tradingName}, ${brandColor})
		`);
		await tx.execute(sql`
			insert into core_member (business_id, user_id, role)
			values (${id}, ${ownerUserId}, 'owner')
		`);
	});

	return { id, tradingName, ownerUserId };
}

/** An additional member of an existing business. */
export async function addMember(
	businessId: string,
	userId: string,
	role: MemberRole = 'staff'
): Promise<void> {
	await runScoped(businessId, userId, async (tx) => {
		await tx.execute(sql`
			insert into core_member (business_id, user_id, role)
			values (${businessId}, ${userId}, ${role})
		`);
	});
}

export async function createCustomer(
	business: TestBusiness,
	name = 'Meridian Developments'
): Promise<string> {
	const id = randomUUID();
	await runScoped(business.id, business.ownerUserId, async (tx) => {
		await tx.execute(sql`
			insert into core_customer (id, business_id, name)
			values (${id}, ${business.id}, ${name})
		`);
	});
	return id;
}

/**
 * The `locals` the hooks would have produced for this person acting for this business.
 *
 * Built here rather than by running the hook stack, so a test can state exactly which part
 * of the request context is present — which is the point, since most of the interesting
 * tests are about what happens when one part is missing.
 */
export async function localsFor(
	user: TestUser,
	business: TestBusiness,
	access: AccessMap = NO_ACCESS
): Promise<Partial<App.Locals>> {
	return runScoped(business.id, user.id, async (tx) => {
		const [businessRow] = await tx.select().from(businessTable);
		// The member row for THIS person, not whichever comes back first. A business with an
		// owner and a staff member has two, and the role on it is what gates billing — so
		// picking the wrong one would quietly make every staff-is-refused test pass.
		const [memberRow] = await tx.select().from(memberTable).where(eq(memberTable.userId, user.id));
		return {
			user: { id: user.id, name: user.name, email: user.email } as App.Locals['user'],
			business: toBusiness(businessRow),
			member: toMember(memberRow),
			access,
			requestId: 'req-test'
		};
	});
}

/** A `RequestEvent` carrying those locals. Only the fields the ctx layer reads are real. */
export function eventFor(locals: Partial<App.Locals>, pathname = '/dashboard'): RequestEvent {
	return {
		locals: { requestId: 'req-test', ...locals },
		url: new URL(`http://localhost:5173${pathname}`),
		cookies: { get: () => undefined, set: () => {} }
	} as unknown as RequestEvent;
}

/**
 * Remove everything this process created, on the owner connection.
 *
 * Order matters twice over: foreign keys constrain it, and `core_member.user_id` is
 * `ON DELETE RESTRICT`, so identity rows can only go once their memberships have. That
 * RESTRICT is the reason this function DISCOVERS businesses rather than only removing the
 * ones `createBusiness` recorded — a test that mints a business through `withNewBusiness()`
 * or through onboarding leaves a membership row this helper never saw, and the user delete
 * would then fail with a foreign key violation that says nothing about the actual cause.
 *
 * Discovery goes through `member_sees_own_membership`, the same SELECT-only policy the
 * application uses to answer "which businesses is this person in?". FORCE ROW LEVEL
 * SECURITY applies to the owner too, so even here there is no way to read the table without
 * establishing a context first.
 */
export async function cleanupFixtures(): Promise<void> {
	if (!createdBusinesses.length && !createdUsers.length) return;

	const client = new pg.Client({
		connectionString: env.DATABASE_MIGRATION_URL || env.DATABASE_URL
	});
	await client.connect();
	try {
		const businessIds = new Set(createdBusinesses.splice(0));

		for (const userId of createdUsers) {
			await client.query('begin');
			try {
				await client.query('select set_config($1, $2, true)', ['cjs.user_id', userId]);
				const { rows } = await client.query<{ business_id: string }>(
					'select business_id from core_member where user_id = $1',
					[userId]
				);
				for (const row of rows) businessIds.add(row.business_id);
				await client.query('commit');
			} catch (error) {
				await client.query('rollback');
				throw error;
			}
		}

		for (const businessId of businessIds) {
			await client.query('begin');
			try {
				// Even as owner. FORCE ROW LEVEL SECURITY means no context, no rows.
				await client.query('select set_config($1, $2, true)', ['cjs.business_id', businessId]);
				// Foreign keys decide the order: lines before their document, documents before the
				// customer they point at, everything before the business.
				//
				// The ledger goes before the documents it refers to — `core_allocation` holds a real
				// foreign key to `core_posting`, and both carry a `source_id` pointing at an invoice
				// or a payment. And `invoicing_payment` has a self-reference (a reversal names the
				// payment it undoes), so reversals come out with the payments in one statement,
				// which works because the delete is not row-ordered.
				for (const table of [
					'audit.row_change',
					'billing_subscription',
					'core_allocation',
					'core_posting',
					'invoicing_payment',
					'invoicing_invoice_event',
					'invoicing_invoice_line',
					'invoicing_invoice',
					'invoicing_setting',
					'quoting_quote_event',
					'quoting_quote_line',
					'quoting_quote',
					'quoting_setting',
					// Inventory unwinds innermost-first: a count line names a movement, a movement
					// names an item and a location, and an item names its default location. The
					// level view holds nothing of its own, so it needs no line here — which is the
					// clearest demonstration of why it is a view.
					'inventory_stock_count_line',
					'inventory_stock_count',
					'inventory_movement',
					'inventory_item',
					'inventory_location',
					'core_document_number',
					'core_customer',
					'core_member',
					'core_business'
				]) {
					await client.query(`delete from ${table} where business_id = $1`, [businessId]);
				}
				await client.query('commit');
			} catch (error) {
				await client.query('rollback');
				throw error;
			}
		}

		for (const userId of createdUsers.splice(0)) {
			await client.query('delete from identity."user" where id = $1', [userId]);
		}
	} finally {
		await client.end();
	}
}
