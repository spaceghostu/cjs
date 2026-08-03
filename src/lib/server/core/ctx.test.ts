/**
 * THE DOOR, EXERCISED.
 *
 * `tenancy.test.ts` proves the database refuses cross-tenant reads. This file proves the
 * layer above it — that the only way module code gets a transaction is through a function
 * that has already established tenancy, attribution and entitlement, and that each of those
 * three fails in the right direction when it is not satisfied.
 *
 * Requires a database: `bun run db:dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closePool } from './db/client';
import {
	cleanupFixtures,
	createBusiness,
	createCustomer,
	createUser,
	eventFor,
	localsFor,
	type TestBusiness,
	type TestUser
} from './db/fixtures';
import { NO_ACCESS, type AccessMap } from './entitlement';
import {
	loadMemberships,
	moduleAccess,
	selectMembership,
	withBusiness,
	withModule,
	withNewBusiness,
	type Membership
} from './ctx';

afterAll(async () => {
	await cleanupFixtures();
	await closePool();
});

function accessWith(overrides: Partial<AccessMap>): AccessMap {
	return { ...NO_ACCESS, ...overrides };
}

/** SvelteKit's `redirect()` and `error()` throw plain objects, not Errors. */
async function thrownBy(run: () => Promise<unknown>): Promise<Record<string, unknown>> {
	try {
		await run();
	} catch (thrown) {
		return thrown as Record<string, unknown>;
	}
	throw new Error('expected the call to be refused, but it succeeded');
}

describe('withBusiness', () => {
	let alice: TestUser;
	let thornhill: TestBusiness;
	let meridian: TestBusiness;
	let locals: Partial<App.Locals>;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		const bongani = await createUser('Bongani Ndlovu');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
		meridian = await createBusiness(bongani.id, 'Meridian Fitouts');

		await createCustomer(thornhill, 'Coastal Property Group');
		await createCustomer(meridian, 'Highveld Retail');

		locals = await localsFor(alice, thornhill);
	});

	it('hands over a transaction that is already scoped', async () => {
		const names = await withBusiness(eventFor(locals), async ({ tx }) => {
			const { rows } = await tx.execute<{ name: string }>(sql`select name from core_customer`);
			return rows.map((r) => r.name);
		});
		expect(names).toEqual(['Coastal Property Group']);
	});

	it('carries who is acting, for the audit trigger', async () => {
		const who = await withBusiness(eventFor(locals), async ({ tx, userId }) => {
			const { rows } = await tx.execute<{ who: string }>(sql`select app.current_user_id() as who`);
			expect(rows[0]?.who).toBe(userId);
			return rows[0]?.who;
		});
		expect(who).toBe(alice.id);
	});

	it('sends a request with no business to onboarding', async () => {
		// Not an error. A signed-in person with no business has somewhere to be, and the
		// tempting alternative — running without a tenant context — is exactly the case that
		// must never reach the database.
		const thrown = await thrownBy(() =>
			withBusiness(eventFor({ user: { id: alice.id } as never }), async () => 'unreachable')
		);
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/onboarding');
	});

	it('sends a signed-out request to sign-in, remembering where it was going', async () => {
		const thrown = await thrownBy(() =>
			withBusiness(eventFor({}, '/invoices/1042'), async () => 'unreachable')
		);
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/sign-in?next=%2Finvoices%2F1042');
	});
});

describe('withModule', () => {
	let alice: TestUser;
	let thornhill: TestBusiness;
	let base: Partial<App.Locals>;

	beforeAll(async () => {
		alice = await createUser('Alice Thornhill');
		thornhill = await createBusiness(alice.id, 'Thornhill Joinery');
		base = await localsFor(alice, thornhill);
	});

	it('allows a write to an owned module', async () => {
		const ran = await withModule(
			eventFor({ ...base, access: accessWith({ invoicing: 'write' }) }),
			'invoicing',
			'write',
			async ({ module, intent }) => `${module}:${intent}`
		);
		expect(ran).toBe('invoicing:write');
	});

	it('allows a READ of a removed module — the data stays yours', async () => {
		// The criterion that distinguishes *removed* from *never owned*. Export depends on
		// this succeeding.
		const ran = await withModule(
			eventFor({ ...base, access: accessWith({ payroll: 'read' }) }),
			'payroll',
			'read',
			async ({ tx }) => {
				const { rows } = await tx.execute<{ n: string }>(
					sql`select count(*)::text as n from core_customer`
				);
				return rows[0]?.n;
			}
		);
		expect(ran).toBe('0');
	});

	it('refuses a WRITE to a removed module', async () => {
		const thrown = await thrownBy(() =>
			withModule(
				eventFor({ ...base, access: accessWith({ payroll: 'read' }) }),
				'payroll',
				'write',
				async () => 'unreachable'
			)
		);
		expect(thrown.status).toBe(403);
		expect((thrown.body as App.Error).code).toBe('module_removed');
	});

	it('refuses both intents on a module that was never owned', async () => {
		for (const intent of ['read', 'write'] as const) {
			const thrown = await thrownBy(() =>
				withModule(eventFor(base), 'inventory', intent, async () => 'unreachable')
			);
			expect(thrown.status).toBe(403);
			expect((thrown.body as App.Error).code).toBe('module_locked');
			// The design's locked state is an offer, not a dead end.
			expect((thrown.body as App.Error).nextHref).toBe('/settings/modules');
		}
	});

	it('refuses before opening a transaction, so a locked module costs no connection', async () => {
		let opened = false;
		await thrownBy(() =>
			withModule(eventFor(base), 'inventory', 'read', async () => {
				opened = true;
				return 'unreachable';
			})
		);
		expect(opened).toBe(false);
	});

	it('reports the module by its human name, never its key', async () => {
		const thrown = await thrownBy(() =>
			withModule(eventFor(base), 'scheduling', 'read', async () => 'unreachable')
		);
		expect((thrown.body as App.Error).message).toContain('Job scheduling');
		expect((thrown.body as App.Error).message).not.toContain('scheduling"');
	});
});

describe('moduleAccess', () => {
	it('answers without refusing, so a route can render the locked state itself', () => {
		const event = eventFor({ access: accessWith({ quoting: 'write', payroll: 'read' }) });
		expect(moduleAccess(event, 'quoting')).toBe('write');
		expect(moduleAccess(event, 'payroll')).toBe('read');
		expect(moduleAccess(event, 'bookings')).toBe('none');
	});

	it('treats a request with no resolved access as locked, not as unrestricted', () => {
		// Fail closed. A missing access map is a bug, and the safe reading of a bug is that
		// nothing is owned.
		expect(moduleAccess(eventFor({}), 'invoicing')).toBe('none');
	});
});

describe('selectMembership — the cookie is a claim, not a fact', () => {
	const thornhill: Membership = {
		businessId: 'aaaaaaaa-0000-4000-8000-000000000001',
		tradingName: 'Thornhill Joinery',
		brandColor: '#5464EE',
		role: 'owner'
	};
	const sibling: Membership = {
		businessId: 'aaaaaaaa-0000-4000-8000-000000000002',
		tradingName: 'Zenith Interiors',
		brandColor: '#277E94',
		role: 'staff'
	};

	it('honours a cookie naming a business the person belongs to', () => {
		expect(selectMembership([thornhill, sibling], sibling.businessId)).toBe(sibling);
	});

	it('IGNORES a cookie naming a business the person does not belong to', () => {
		// The acceptance criterion: a user who belongs to business A cannot act for business
		// B by editing the request. They land on their own business, not on an error and not
		// on someone else's data.
		const foreign = 'bbbbbbbb-0000-4000-8000-000000000009';
		expect(selectMembership([thornhill, sibling], foreign)).toBe(thornhill);
	});

	it('falls back rather than locking someone out with a stale cookie', () => {
		expect(selectMembership([thornhill], undefined)).toBe(thornhill);
	});

	it('returns null when the person belongs to nothing', () => {
		expect(selectMembership([], thornhill.businessId)).toBeNull();
	});
});

describe('loadMemberships', () => {
	it('sees only the asking user’s businesses', async () => {
		const alice = await createUser('Alice Thornhill');
		const bongani = await createUser('Bongani Ndlovu');
		const hers = await createBusiness(alice.id, 'Thornhill Joinery');
		await createBusiness(bongani.id, 'Meridian Fitouts');

		const memberships = await loadMemberships(alice.id);
		expect(memberships.map((m) => m.businessId)).toEqual([hers.id]);
		expect(memberships[0].role).toBe('owner');
	});
});

describe('withNewBusiness', () => {
	it('creates a business inside the policy rather than around it', async () => {
		// Onboarding's chicken-and-egg, resolved by adopting the new id as the transaction's
		// context before the first statement. Both rows satisfy `tenant_isolation`.
		const owner = await createUser('New Owner');

		const id = await withNewBusiness(owner.id, async ({ tx, businessId }) => {
			await tx.execute(sql`
				insert into core_business (business_id, trading_name)
				values (${businessId}, 'Brand New Joinery')
			`);
			await tx.execute(sql`
				insert into core_member (business_id, user_id, role)
				values (${businessId}, ${owner.id}, 'owner')
			`);
			return businessId;
		});

		const memberships = await loadMemberships(owner.id);
		expect(memberships).toEqual([
			expect.objectContaining({ businessId: id, tradingName: 'Brand New Joinery', role: 'owner' })
		]);
	});

	it('generates the id itself, so there is no parameter pointing at an existing business', async () => {
		const owner = await createUser('Another Owner');
		const seen: string[] = [];
		for (let i = 0; i < 2; i += 1) {
			await withNewBusiness(owner.id, async ({ businessId }) => void seen.push(businessId));
		}
		expect(seen[0]).not.toBe(seen[1]);
	});
});
