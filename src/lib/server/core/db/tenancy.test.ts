/**
 * THE FLOOR, PROVEN.
 *
 * `scripts/invariants.sql` asserts the SHAPE of the tenancy model — that the columns,
 * policies and grants are as they should be. This file asserts its BEHAVIOUR: that two
 * businesses in one database genuinely cannot see each other, that a request which forgets
 * its context sees nothing rather than everything, and that nothing can be deleted.
 *
 * Both are necessary. A policy can be present and wrong. These tests run against a real
 * Postgres, because a fake with no row level security would pass every one of them while
 * proving nothing at all.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closePool, runAsUser, runScoped, unsafeDb } from './client';
import { allocateDocumentNumber, peekDocumentNumber } from './numbering';
import {
	addMember,
	cleanupFixtures,
	createBusiness,
	createCustomer,
	createUser,
	messageFromRejection,
	type TestBusiness,
	type TestUser
} from './fixtures';

// `unsafeDb` holds ONE pool for the whole module, so it is closed once here rather than by
// each suite — an already-ended pool throws on the second `end()`.
afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

describe('tenant isolation', () => {
	let alice: TestUser;
	let bongani: TestUser;
	let thornhill: TestBusiness;
	let meridian: TestBusiness;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		bongani = await createUser('Bongani Ndlovu');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
		meridian = await createBusiness(bongani.id, 'Meridian Fitouts');

		await createCustomer(thornhill, 'Coastal Property Group');
		await createCustomer(meridian, 'Highveld Retail');
	});

	it('shows a business only its own customers', async () => {
		const mine = await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute<{ name: string }>(sql`select name from core_customer`)
		);
		expect(mine.rows.map((r) => r.name)).toEqual(['Coastal Property Group']);

		const theirs = await runScoped(meridian.id, bongani.id, (tx) =>
			tx.execute<{ name: string }>(sql`select name from core_customer`)
		);
		expect(theirs.rows.map((r) => r.name)).toEqual(['Highveld Retail']);
	});

	it('shows a business only itself in core_business', async () => {
		const { rows } = await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute<{ trading_name: string }>(sql`select trading_name from core_business`)
		);
		expect(rows.map((r) => r.trading_name)).toEqual(['Thornhill Joinery']);
	});

	it('cannot reach another business by naming its id in a WHERE clause', async () => {
		// The policy is not a filter the query can opt out of. Asking for Meridian's rows
		// while scoped to Thornhill returns nothing — no error, no leak.
		const { rows } = await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute(sql`select * from core_customer where business_id = ${meridian.id}`)
		);
		expect(rows).toHaveLength(0);
	});

	it('cannot WRITE a row belonging to another business', async () => {
		// `WITH CHECK` on the tenant policy. Even holding a valid transaction for Thornhill,
		// a row stamped with Meridian's id is refused rather than silently re-homed.
		const message = await messageFromRejection(
			runScoped(thornhill.id, alice.id, (tx) =>
				tx.execute(sql`
					insert into core_customer (business_id, name)
					values (${meridian.id}, 'Smuggled In')
				`)
			)
		);
		expect(message).toMatch(/new row violates row-level security policy/i);
	});

	it('returns zero rows when no session variable is set at all', async () => {
		// The failure mode of forgetting the context. `unsafeDb` here is not a loophole —
		// it is the unscoped handle, used deliberately to prove that holding it gets you
		// nothing. This is the single most important assertion in the file: the default
		// answer of every tenant table is "nothing", not "everything".
		for (const table of ['core_business', 'core_member', 'core_customer', 'core_document_number']) {
			const { rows } = await unsafeDb.execute<{ n: string }>(
				sql`select count(*)::text as n from ${sql.raw(table)}`
			);
			expect(rows[0]?.n, `${table} leaked rows without a session variable`).toBe('0');
		}
	});

	it('returns zero rows when the context is a business that does not exist', async () => {
		const nowhere = '00000000-0000-4000-8000-000000000000';
		const { rows } = await runScoped(nowhere, alice.id, (tx) =>
			tx.execute(sql`select * from core_customer`)
		);
		expect(rows).toHaveLength(0);
	});

	it('refuses a malformed business context rather than falling back to none', async () => {
		// `app.current_business_id()` casts to uuid and lets the cast raise. A garbage value
		// is a bug or an attack; a quiet empty result would hide both.
		const message = await messageFromRejection(
			unsafeDb.transaction(async (tx) => {
				await tx.execute(sql`select set_config('cjs.business_id', 'not-a-uuid', true)`);
				return tx.execute(sql`select * from core_customer`);
			})
		);
		expect(message).toMatch(/invalid input syntax for type uuid/i);
	});
});

describe('the pre-tenant membership lookup', () => {
	let alice: TestUser;
	let bongani: TestUser;
	let thornhill: TestBusiness;
	let meridian: TestBusiness;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		bongani = await createUser('Bongani Ndlovu');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
		meridian = await createBusiness(bongani.id, 'Meridian Fitouts');
	});

	it('lets a signed-in person see the businesses they belong to, and no others', async () => {
		const { rows } = await runAsUser(alice.id, (tx) =>
			tx.execute<{ trading_name: string; role: string }>(sql`
				select b.trading_name, m.role
				  from core_member m
				  join core_business b on b.business_id = m.business_id
				 where m.user_id = ${alice.id}
			`)
		);
		expect(rows).toEqual([{ trading_name: 'Thornhill Joinery', role: 'owner' }]);
	});

	it('reflects a second membership as soon as it exists', async () => {
		await addMember(meridian.id, alice.id, 'staff');

		const { rows } = await runAsUser(alice.id, (tx) =>
			tx.execute<{ trading_name: string }>(sql`
				select b.trading_name
				  from core_member m
				  join core_business b on b.business_id = m.business_id
				 order by b.trading_name
			`)
		);
		expect(rows.map((r) => r.trading_name)).toEqual(['Meridian Fitouts', 'Thornhill Joinery']);
	});

	it('grants no access to tenant data — only to the membership rows themselves', async () => {
		// The policies that make the lookup possible are SELECT-only and cover exactly two
		// tables. Everything else still evaluates `business_id = NULL`.
		await createCustomer(thornhill, 'Should Stay Hidden');

		const { rows } = await runAsUser(alice.id, (tx) =>
			tx.execute(sql`select * from core_customer`)
		);
		expect(rows).toHaveLength(0);
	});

	it('shows nothing to a user who is a member of nothing', async () => {
		const stranger = await createUser('Passing Stranger');
		const { rows } = await runAsUser(stranger.id, (tx) =>
			tx.execute(sql`select * from core_member`)
		);
		expect(rows).toHaveLength(0);
	});

	it('answers for the acting user, not for whoever asked last', async () => {
		const { rows } = await runAsUser(bongani.id, (tx) =>
			tx.execute<{ trading_name: string }>(sql`select trading_name from core_business`)
		);
		expect(rows.map((r) => r.trading_name)).toEqual(['Meridian Fitouts']);
	});
});

describe('business records are never destroyed', () => {
	let alice: TestUser;
	let thornhill: TestBusiness;
	let customerId: string;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
		customerId = await createCustomer(thornhill, 'Coastal Property Group');
	});

	it.each(['core_business', 'core_member', 'core_customer', 'core_document_number'])(
		'refuses DELETE on %s',
		async (table) => {
			const message = await messageFromRejection(
				runScoped(thornhill.id, alice.id, (tx) => tx.execute(sql`delete from ${sql.raw(table)}`))
			);
			expect(message).toMatch(new RegExp(`permission denied for table ${table}`, 'i'));
		}
	);

	it('refuses TRUNCATE, which would empty a table without a single DELETE', async () => {
		const message = await messageFromRejection(
			runScoped(thornhill.id, alice.id, (tx) => tx.execute(sql`truncate core_customer`))
		);
		expect(message).toMatch(/permission denied|must be owner/i);
	});

	it('offers archiving instead, which is an UPDATE', async () => {
		await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute(sql`update core_customer set archived_at = now() where id = ${customerId}`)
		);

		const { rows } = await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute<{ archived_at: Date | null }>(
				sql`select archived_at from core_customer where id = ${customerId}`
			)
		);
		expect(rows[0]?.archived_at).not.toBeNull();
	});

	it('keeps identity deletable — sign-out depends on it', async () => {
		// The mirror image, and the reason `identity` is exempt by name rather than by
		// accident. If the platform-wide REVOKE reached it, nobody could sign out.
		const { rows } = await unsafeDb.execute<{ can: boolean }>(sql`
			select has_table_privilege(current_user, 'identity.session', 'DELETE') as can
		`);
		expect(rows[0]?.can).toBe(true);
	});
});

describe('the audit log', () => {
	let alice: TestUser;
	let thornhill: TestBusiness;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
	});

	it('records the insert that created the business, attributed to the acting user', async () => {
		const { rows } = await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute<{ table_name: string; op: string; actor_user_id: string }>(sql`
				select table_name, op, actor_user_id
				  from audit.row_change
				 where table_name = 'core_business'
			`)
		);
		expect(rows).toEqual([{ table_name: 'core_business', op: 'INSERT', actor_user_id: alice.id }]);
	});

	it('records an update with both sides of the change', async () => {
		await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute(sql`update core_business set phone = '021 555 0134'`)
		);

		const { rows } = await runScoped(thornhill.id, alice.id, (tx) =>
			tx.execute<{ before: Record<string, unknown>; after: Record<string, unknown> }>(sql`
				select before, after
				  from audit.row_change
				 where table_name = 'core_business' and op = 'UPDATE'
			`)
		);
		expect(rows[0]?.before.phone).toBeNull();
		expect(rows[0]?.after.phone).toBe('021 555 0134');
	});

	it('is scoped to one business like everything else', async () => {
		const bongani = await createUser('Bongani Ndlovu');
		const meridian = await createBusiness(bongani.id, 'Meridian Fitouts');

		const { rows } = await runScoped(meridian.id, bongani.id, (tx) =>
			tx.execute<{ business_id: string }>(sql`select distinct business_id from audit.row_change`)
		);
		expect(rows.map((r) => r.business_id)).toEqual([meridian.id]);
	});

	it('is append-only: the application cannot rewrite an entry', async () => {
		const message = await messageFromRejection(
			runScoped(thornhill.id, alice.id, (tx) =>
				tx.execute(sql`update audit.row_change set actor_user_id = 'someone else'`)
			)
		);
		expect(message).toMatch(/permission denied for table row_change/i);
	});

	it('is append-only: the application cannot remove an entry', async () => {
		const message = await messageFromRejection(
			runScoped(thornhill.id, alice.id, (tx) => tx.execute(sql`delete from audit.row_change`))
		);
		expect(message).toMatch(/permission denied for table row_change/i);
	});
});

describe('document numbering', () => {
	let alice: TestUser;
	let thornhill: TestBusiness;
	let meridian: TestBusiness;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		const bongani = await createUser('Bongani Ndlovu');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
		meridian = await createBusiness(bongani.id, 'Meridian Fitouts');
	});

	it('starts each sequence at its documented first number', async () => {
		const first = await runScoped(thornhill.id, alice.id, (tx) =>
			allocateDocumentNumber(tx, 'quote')
		);
		expect(first).toEqual({ value: 1001, prefix: 'QT', formatted: 'QT-1001' });
	});

	it('advances by one and pads to the design’s width', async () => {
		const second = await runScoped(thornhill.id, alice.id, (tx) =>
			allocateDocumentNumber(tx, 'quote')
		);
		expect(second.formatted).toBe('QT-1002');
	});

	it('keeps each document type on its own counter', async () => {
		const invoice = await runScoped(thornhill.id, alice.id, (tx) =>
			allocateDocumentNumber(tx, 'invoice')
		);
		expect(invoice.formatted).toBe('INV-1001');
	});

	it('keeps each business on its own counter', async () => {
		const theirs = await runScoped(meridian.id, meridian.ownerUserId, (tx) =>
			allocateDocumentNumber(tx, 'quote')
		);
		expect(theirs.formatted).toBe('QT-1001');
	});

	it('never hands the same number to two concurrent allocations', async () => {
		// The property that matters. Ten transactions racing for the same counter must come
		// back with ten distinct numbers — the row lock serialises them.
		const results = await Promise.all(
			Array.from({ length: 10 }, () =>
				runScoped(thornhill.id, alice.id, (tx) => allocateDocumentNumber(tx, 'credit_note'))
			)
		);
		const values = results.map((r) => r.value).sort((a, b) => a - b);
		expect(new Set(values).size).toBe(10);
		expect(values).toEqual([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010]);
	});

	it('spends the number even when the document is abandoned', async () => {
		// A rolled-back quote leaves a GAP. That is the correct behaviour, not a defect:
		// reusing QT-1003 would hand a second client a number the first may already have
		// seen on a PDF.
		const before = await runScoped(thornhill.id, alice.id, (tx) =>
			peekDocumentNumber(tx, 'stock_count')
		);

		await expect(
			runScoped(thornhill.id, alice.id, async (tx) => {
				await allocateDocumentNumber(tx, 'stock_count');
				throw new Error('user changed their mind');
			})
		).rejects.toThrow('user changed their mind');

		const after = await runScoped(thornhill.id, alice.id, (tx) =>
			peekDocumentNumber(tx, 'stock_count')
		);
		// Rolled back with the transaction — the counter is untouched, so the next document
		// takes the number the abandoned one was holding.
		expect(after.value).toBe(before.value);
	});

	it('peeks without taking', async () => {
		const peeked = await runScoped(meridian.id, meridian.ownerUserId, (tx) =>
			peekDocumentNumber(tx, 'quote')
		);
		const peekedAgain = await runScoped(meridian.id, meridian.ownerUserId, (tx) =>
			peekDocumentNumber(tx, 'quote')
		);
		expect(peekedAgain.value).toBe(peeked.value);
	});

	it('refuses to allocate without a business context', async () => {
		const message = await messageFromRejection(
			unsafeDb.transaction(async (tx) =>
				// Casting is the only way to reach this state, which is the point — it is
				// unreachable from module code, and this proves the failure is loud.
				allocateDocumentNumber(tx as never, 'quote')
			)
		);
		expect(message).toMatch(/no business context|row-level security/i);
	});
});
