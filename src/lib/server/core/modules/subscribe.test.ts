/**
 * ADD, REMOVE, RE-ADD — against a real database.
 *
 * The acceptance criteria this file exists for are all statements about HISTORY, and history
 * is exactly what a mock cannot be wrong about convincingly:
 *
 *   adding, removing and re-adding leaves TWO distinct periods
 *   a removed module is readable and exportable, and not writable
 *   a never-owned module is the locked state, not an error
 *   the running total moves, from the one function that computes it
 *   undo closes a period as if it never opened, and charges nothing
 *
 * The unique partial index, the RLS policy and the missing DELETE grant are all load-bearing
 * here, and none of them exist anywhere but in Postgres.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc } from 'drizzle-orm';
import { closePool, runScoped } from '../db/client';
import {
	addMember,
	cleanupFixtures,
	createBusiness,
	createUser,
	eventFor,
	localsFor,
	messageFromRejection,
	type TestBusiness,
	type TestUser
} from '../db/fixtures';
import { subscription } from '../db/schema/billing';
import { withBusiness, type Ctx } from '../ctx';
import { loadAccess, permits } from '../entitlement';
import { monthlyTotal } from './catalogue';
import { loadSubscriptions, openPeriod } from './subscriptions';
import { addModule, removeModule, undoAddition } from './subscribe';

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

/** SvelteKit's `error()` throws a plain object, not an Error. */
async function thrownBy(run: () => Promise<unknown>): Promise<Record<string, unknown>> {
	try {
		await run();
	} catch (thrown) {
		return thrown as Record<string, unknown>;
	}
	throw new Error('expected the call to be refused, but it succeeded');
}

/**
 * Deliberately in the PAST.
 *
 * `accessFromPeriods` is asked about `new Date()` here, because that is what the product
 * does — so a period whose `ended_at` is in the future is correctly still open, and a test
 * that closed one "next month" would assert the opposite of what it meant to.
 */
const JULY_31 = new Date('2024-07-31T09:00:00+02:00');
const AUG_11 = new Date('2024-08-11T09:00:00+02:00');
const SEP_1 = new Date('2024-09-01T09:00:00+02:00');

describe('the subscription lifecycle', () => {
	let owner: TestUser;
	let business: TestBusiness;

	/**
	 * Runs `fn` with a fresh `Ctx` whose access map is read from the database rather than
	 * handed in — so every step below sees the entitlement the PREVIOUS step actually created.
	 */
	async function act<T>(user: TestUser, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
		const locals = await localsFor(user, business);
		const access = await runScoped(business.id, user.id, (tx) => loadAccess(tx));
		return withBusiness(eventFor({ ...locals, access }), fn);
	}

	beforeAll(async () => {
		owner = await createUser('Alice Thornhill');
		business = await createBusiness(owner.id, 'Thornhill Joinery');
	});

	it('starts with every module locked, and no error anywhere', async () => {
		const access = await act(owner, async (ctx) => ctx.access);

		expect(access.payroll).toBe('none');
		// The locked state is an ANSWER, not a failure. Nothing above threw to produce it.
		expect(permits(access.payroll, 'read')).toBe(false);
		expect(monthlyTotal(access).cents).toBe(0);
	});

	it('charges a prorated amount for the day it is added', async () => {
		const result = await act(owner, (ctx) => addModule(ctx, 'payroll', JULY_31));

		// R120 / 31 days = R3.87 for the one remaining day of July. The design's own example.
		expect(result.chargedToday.cents).toBe(387);
	});

	it('grants write immediately, and moves the running total', async () => {
		const access = await act(owner, async (ctx) => ctx.access);

		expect(access.payroll).toBe('write');
		expect(monthlyTotal(access).cents).toBe(12_000);
	});

	it('snapshots the price on the period rather than pointing at the catalogue', async () => {
		const [period] = await act(owner, (ctx) => loadSubscriptions(ctx.tx));
		expect(period.price.cents).toBe(12_000);
	});

	it('refuses a second add of the same module — the index, not a check-then-insert', async () => {
		// The application-level guard fires first; the point of the test below it is that the
		// DATABASE would also have refused, which is what makes a double click safe.
		const refusal = await thrownBy(() => act(owner, (ctx) => addModule(ctx, 'payroll', AUG_11)));
		expect(refusal.status).toBe(409);

		const message = await messageFromRejection(
			runScoped(business.id, owner.id, (tx) =>
				tx.insert(subscription).values({
					businessId: business.id,
					moduleKey: 'payroll',
					startedAt: AUG_11,
					priceCents: 12_000,
					currency: 'ZAR'
				})
			)
		);
		expect(message).toContain('billing_subscription_one_open_per_module');
	});

	it('leaves the data readable and exportable after removal, but not writable', async () => {
		const charged = await act(owner, (ctx) => removeModule(ctx, 'payroll', AUG_11));
		// Added 31 July, removed 11 August: the July part-month was already charged, and this
		// month's charge is for the days held in it.
		expect(charged.sameDay).toBe(false);

		const access = await act(owner, async (ctx) => ctx.access);
		expect(access.payroll).toBe('read');
		expect(permits(access.payroll, 'read')).toBe(true);
		expect(permits(access.payroll, 'write')).toBe(false);
		// And the business stops paying for it.
		expect(monthlyTotal(access).cents).toBe(0);
	});

	it('opens a NEW period on re-add, and keeps the old one', async () => {
		await act(owner, (ctx) => addModule(ctx, 'payroll', SEP_1));

		const periods = await act(owner, (ctx) => loadSubscriptions(ctx.tx));
		const payroll = periods.filter((p) => p.moduleKey === 'payroll');

		expect(payroll).toHaveLength(2);
		// Newest first. The old period is closed and untouched; the new one is open.
		expect(payroll[0].endedAt).toBeNull();
		expect(payroll[1].endedAt).not.toBeNull();
		expect(payroll[1].startedAt.getTime()).toBe(JULY_31.getTime());
	});
});

describe('undo', () => {
	let owner: TestUser;
	let business: TestBusiness;

	async function act<T>(user: TestUser, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
		const locals = await localsFor(user, business);
		const access = await runScoped(business.id, user.id, (tx) => loadAccess(tx));
		return withBusiness(eventFor({ ...locals, access }), fn);
	}

	beforeAll(async () => {
		owner = await createUser('Beatrice Sithole');
		business = await createBusiness(owner.id, 'Sithole Electrical');
	});

	it('reverses an add completely: no access, no charge, no period', async () => {
		const added = await act(owner, (ctx) => addModule(ctx, 'quoting', JULY_31));
		expect(await act(owner, async (ctx) => ctx.access)).toMatchObject({ quoting: 'write' });

		const undone = await act(owner, (ctx) => undoAddition(ctx, added.subscriptionId, JULY_31));
		expect(undone).toEqual({ moduleKey: 'quoting' });

		const access = await act(owner, async (ctx) => ctx.access);
		// Not `read` — a voided period must not leave behind an archive of a module nobody
		// ever used. That distinction is the whole reason `voided_at` exists.
		expect(access.quoting).toBe('none');
		expect(monthlyTotal(access).cents).toBe(0);
		expect(await act(owner, (ctx) => loadSubscriptions(ctx.tx))).toHaveLength(0);
	});

	it('is idempotent — pressing Undo twice is not an error', async () => {
		const added = await act(owner, (ctx) => addModule(ctx, 'bookings', JULY_31));
		await act(owner, (ctx) => undoAddition(ctx, added.subscriptionId, JULY_31));

		expect(await act(owner, (ctx) => undoAddition(ctx, added.subscriptionId, JULY_31))).toBeNull();
	});

	it('does not apply after the day it was added — that is a removal', async () => {
		const added = await act(owner, (ctx) => addModule(ctx, 'invoicing', JULY_31));
		expect(await act(owner, (ctx) => undoAddition(ctx, added.subscriptionId, AUG_11))).toBeNull();

		// Still owned. The way out from here is Remove, which charges for the days held.
		expect(await act(owner, async (ctx) => ctx.access)).toMatchObject({ invoicing: 'write' });
	});
});

describe('who may change what a business pays for', () => {
	let owner: TestUser;
	let staff: TestUser;
	let business: TestBusiness;

	beforeAll(async () => {
		owner = await createUser('Chris Naidoo');
		staff = await createUser('Dineo Molefe');
		business = await createBusiness(owner.id, 'Naidoo Plumbing');
		await addMember(business.id, staff.id, 'staff');
	});

	async function actAs<T>(user: TestUser, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
		const locals = await localsFor(user, business);
		const access = await runScoped(business.id, user.id, (tx) => loadAccess(tx));
		return withBusiness(eventFor({ ...locals, access }), fn);
	}

	it('refuses a staff member, at the point of effect', async () => {
		// The switcher disables the button and says why. This is the refusal that matters:
		// a form post from a staff member gets no further than here.
		const refusal = await thrownBy(() => actAs(staff, (ctx) => addModule(ctx, 'quoting', JULY_31)));

		expect(refusal.status).toBe(403);
		expect(refusal.body).toMatchObject({ code: 'not_billing_admin' });
	});

	it('refuses a staff member a removal too — both directions, one gate', async () => {
		await actAs(owner, (ctx) => addModule(ctx, 'quoting', JULY_31));

		const refusal = await thrownBy(() =>
			actAs(staff, (ctx) => removeModule(ctx, 'quoting', AUG_11))
		);
		expect(refusal.status).toBe(403);
	});

	it('refuses a module that is not for sale rather than treating it as free', async () => {
		const refusal = await thrownBy(() =>
			actAs(owner, (ctx) => addModule(ctx, 'expenses', JULY_31))
		);
		expect(refusal.body).toMatchObject({ code: 'module_not_for_sale' });
	});

	it('refuses removing a module the business does not have', async () => {
		const refusal = await thrownBy(() =>
			actAs(owner, (ctx) => removeModule(ctx, 'inventory', JULY_31))
		);
		expect(refusal.body).toMatchObject({ code: 'module_not_added' });
	});
});

describe('same-day removal', () => {
	let owner: TestUser;
	let business: TestBusiness;

	beforeAll(async () => {
		owner = await createUser('Elias van Wyk');
		business = await createBusiness(owner.id, 'Van Wyk Joinery');
	});

	async function act<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
		const locals = await localsFor(owner, business);
		const access = await runScoped(business.id, owner.id, (tx) => loadAccess(tx));
		return withBusiness(eventFor({ ...locals, access }), fn);
	}

	it('charges nothing and leaves no archive — "remove it today and you\'re not charged"', async () => {
		await act((ctx) => addModule(ctx, 'inventory', JULY_31));

		const result = await act((ctx) =>
			removeModule(ctx, 'inventory', new Date('2024-07-31T17:30:00+02:00'))
		);

		expect(result.sameDay).toBe(true);
		expect(result.charged.cents).toBe(0);

		const access = await act(async (ctx) => ctx.access);
		expect(access.inventory).toBe('none');
	});

	it('records the void rather than deleting the row — nothing is ever destroyed', async () => {
		const rows = await runScoped(business.id, owner.id, (tx) =>
			tx.select().from(subscription).orderBy(desc(subscription.startedAt))
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].voidedAt).not.toBeNull();
		// And it is invisible to everything that reads periods.
		const live = await act((ctx) => loadSubscriptions(ctx.tx));
		expect(live).toHaveLength(0);
		expect(openPeriod(live, 'inventory')).toBeNull();
	});
});
