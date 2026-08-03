/**
 * Proves the hand-written `identity` schema is exactly what better-auth expects, by
 * driving better-auth's OWN adapter against a real Postgres.
 *
 * This replaces `@better-auth/cli generate` (which cannot load a SvelteKit-aliased config)
 * and is a stronger check: a text diff proves the file LOOKS right, this proves it WORKS.
 * When a better-auth upgrade adds a field, this fails naming the field.
 *
 * It also proves the two grants that are easy to get wrong and fatal in opposite
 * directions: identity must be writable, and — unlike every other schema in this database
 * — it must be DELETABLE, or sign-out and magic-link consumption break.
 *
 * Requires a database: `bun run db:dev`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { unsafeDb, closePool } from '../client';
import { user, session, account, verification } from './identity';

type Adapter = Awaited<ReturnType<typeof adapterFor>>;

async function adapterFor() {
	const ctx = await auth.$context;
	return ctx.adapter;
}

const uniq = (p: string) =>
	`${p}-${process.pid}-${performance.now().toString(36).replace('.', '')}`;

describe('identity schema', () => {
	let adapter: Adapter;
	const emails: string[] = [];

	beforeAll(async () => {
		adapter = await adapterFor();
	});

	afterAll(async () => {
		for (const email of emails) {
			const [row] = await unsafeDb.select().from(user).where(eq(user.email, email));
			if (row) await unsafeDb.delete(user).where(eq(user.id, row.id)); // cascades
		}
		await closePool();
	});

	it('round-trips a user through better-auth’s adapter', async () => {
		const email = `${uniq('user')}@example.test`;
		emails.push(email);

		const created = await adapter.create<Record<string, unknown>, { id: string; email: string }>({
			model: 'user',
			data: {
				name: 'Thandi Mokoena',
				email,
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		expect(created.id).toBeTruthy();

		const found = await adapter.findOne<{ id: string; name: string }>({
			model: 'user',
			where: [{ field: 'email', value: email }]
		});
		expect(found?.name).toBe('Thandi Mokoena');

		// And it is genuinely in OUR table, in the identity schema.
		const [row] = await unsafeDb.select().from(user).where(eq(user.email, email));
		expect(row?.id).toBe(created.id);
		expect(row?.emailVerified).toBe(false);
	});

	it('round-trips session, account and verification', async () => {
		const email = `${uniq('user')}@example.test`;
		emails.push(email);

		const u = await adapter.create<Record<string, unknown>, { id: string }>({
			model: 'user',
			data: {
				name: 'Frik van Wyk',
				email,
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		const s = await adapter.create<Record<string, unknown>, { id: string; token: string }>({
			model: 'session',
			data: {
				userId: u.id,
				token: uniq('tok'),
				expiresAt: new Date(Date.now() + 60_000),
				ipAddress: '196.0.0.1',
				userAgent: 'vitest',
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});
		expect(s.id).toBeTruthy();

		// The OAuth path: Google/Microsoft sign-in writes an account row with tokens.
		const a = await adapter.create<Record<string, unknown>, { id: string }>({
			model: 'account',
			data: {
				userId: u.id,
				accountId: uniq('acct'),
				providerId: 'google',
				accessToken: 'at',
				refreshToken: 'rt',
				idToken: 'it',
				accessTokenExpiresAt: new Date(Date.now() + 3600_000),
				refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
				scope: 'openid email profile',
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});
		expect(a.id).toBeTruthy();

		// The magic-link path writes and then consumes a verification row.
		const v = await adapter.create<Record<string, unknown>, { id: string }>({
			model: 'verification',
			data: {
				identifier: email,
				value: uniq('val'),
				expiresAt: new Date(Date.now() + 900_000),
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});
		expect(v.id).toBeTruthy();

		const rows = await unsafeDb.select().from(session).where(eq(session.userId, u.id));
		expect(rows).toHaveLength(1);
		expect(await unsafeDb.select().from(account).where(eq(account.userId, u.id))).toHaveLength(1);
		expect(
			await unsafeDb.select().from(verification).where(eq(verification.identifier, email))
		).toHaveLength(1);
	});

	it('permits DELETE — sign-out and magic-link consumption depend on it', async () => {
		const email = `${uniq('user')}@example.test`;
		emails.push(email);

		const u = await adapter.create<Record<string, unknown>, { id: string }>({
			model: 'user',
			data: {
				name: 'Sign Out',
				email,
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});
		const token = uniq('tok');
		await adapter.create({
			model: 'session',
			data: {
				userId: u.id,
				token,
				expiresAt: new Date(Date.now() + 60_000),
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		// This is exactly what sign-out does. Under the platform-wide `REVOKE DELETE` that
		// every OTHER schema carries, it would raise — and nobody could sign out.
		await adapter.delete({ model: 'session', where: [{ field: 'token', value: token }] });

		expect(await unsafeDb.select().from(session).where(eq(session.token, token))).toHaveLength(0);
	});

	it('enforces one account per email', async () => {
		const email = `${uniq('user')}@example.test`;
		emails.push(email);
		const data = {
			name: 'First',
			email,
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date()
		};
		await adapter.create({ model: 'user', data });
		await expect(
			adapter.create({ model: 'user', data: { ...data, name: 'Second' } })
		).rejects.toThrow();
	});
});
