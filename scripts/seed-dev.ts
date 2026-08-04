/**
 * A signed-in developer, in one command.
 *
 *   bun run db:seed
 *
 * Sign-in is a magic link whose email is printed to the dev server's console when SMTP is
 * unset (`$lib/server/core/mail`), which is correct for the product and tedious for the
 * fifteenth `db:dev:reset` of an afternoon. This mints the account the password form on
 * `/sign-in` already accepts, plus the business that keeps `handleGuard` from bouncing the
 * session to `/onboarding`.
 *
 * IT DOES NOT GO AROUND ANYTHING
 * ------------------------------
 * There is no dev-only bypass in the application — no `?dev_login=`, no branch on `dev` in
 * a route. Everything here is written through the SAME doors the product uses: the password
 * is hashed by better-auth's own `hashPassword`, so the credential is indistinguishable from
 * one created by sign-up; and the business and membership are inserted as the unprivileged
 * `cjs_app` role under `cjs.business_id`, which is exactly what `withNewBusiness` does in
 * `src/routes/onboarding/+page.server.ts`. If a tenant policy would refuse the real
 * onboarding write, it refuses this one too.
 *
 * LOCAL ONLY
 * ----------
 * It refuses to run against anything but a loopback host. A seeded account with a known
 * password is a back door if it ever reaches a shared database, and the check is on the
 * connection string rather than on NODE_ENV because that is the thing that decides which
 * database actually gets written to.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from 'better-auth/crypto';

/** Overridable so a second developer, or a second business, is one env var away. */
const EMAIL = process.env.SEED_EMAIL || 'dev@cjs.local';
const PASSWORD = process.env.SEED_PASSWORD || 'devpassword';
const NAME = process.env.SEED_NAME || 'Dev Developer';
const BUSINESS = process.env.SEED_BUSINESS || 'Dev Workshop';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * better-auth's identifier for an email+password credential. The `account` row is what
 * `signInEmail` looks up; a `user` row on its own can be found and never signed in as.
 */
const CREDENTIAL_PROVIDER = 'credential';

export type SeedResult = {
	email: string;
	password: string;
	userId: string;
	businessId: string;
	/** False when the account and business were already there and nothing was inserted. */
	created: boolean;
};

function assertLocal(connectionString: string): void {
	// `new URL` handles the ipv6 brackets and the credentials in the userinfo section, both
	// of which defeat a naive string match.
	const host = new URL(connectionString).hostname;
	if (LOOPBACK.has(host)) return;

	throw new Error(
		`Refusing to seed: DATABASE_URL points at "${host}", which is not a loopback address. ` +
			`This script creates an account with a known password — it belongs on a developer's ` +
			`machine and nowhere else.`
	);
}

/**
 * The identity half. No tenancy here: `identity` is the one schema without RLS, because a
 * person has to be findable before any business context exists.
 *
 * Re-running is an UPDATE rather than a failure, so `SEED_PASSWORD=... bun run db:seed`
 * is also how you change it.
 */
async function upsertUser(client: pg.Client): Promise<{ userId: string; created: boolean }> {
	const existing = await client.query<{ id: string }>(
		'select id from identity."user" where email = $1',
		[EMAIL]
	);

	const hash = await hashPassword(PASSWORD);

	if (existing.rows[0]) {
		const userId = existing.rows[0].id;
		// The credential can be missing even when the user is not — an identity created by a
		// magic link has no password until one is set.
		const updated = await client.query(
			`update identity."account" set password = $3, updated_at = now()
			  where user_id = $1 and provider_id = $2`,
			[userId, CREDENTIAL_PROVIDER, hash]
		);

		if (updated.rowCount === 0) {
			await client.query(
				`insert into identity."account" (id, account_id, provider_id, user_id, password)
				 values ($1, $2, $3, $2, $4)`,
				[randomUUID(), userId, CREDENTIAL_PROVIDER, hash]
			);
		}

		return { userId, created: false };
	}

	const userId = randomUUID();
	await client.query(
		`insert into identity."user" (id, name, email, email_verified) values ($1, $2, $3, true)`,
		[userId, NAME, EMAIL]
	);
	await client.query(
		`insert into identity."account" (id, account_id, provider_id, user_id, password)
		 values ($1, $2, $3, $2, $4)`,
		[randomUUID(), userId, CREDENTIAL_PROVIDER, hash]
	);

	return { userId, created: true };
}

/**
 * The tenant half, through the floor rather than around it.
 *
 * `cjs.user_id` alone is what `runAsUser` sets, and it is enough to read one's own
 * membership via `member_sees_own_membership`. Creating a business additionally adopts the
 * new id as `cjs.business_id` BEFORE the insert, so `tenant_isolation`'s WITH CHECK passes
 * on a row that does not exist yet — the same sequence as `withNewBusiness`.
 */
async function ensureBusiness(
	client: pg.Client,
	userId: string
): Promise<{ businessId: string; created: boolean }> {
	await client.query('select set_config($1, $2, true)', ['cjs.user_id', userId]);

	const membership = await client.query<{ business_id: string }>(
		'select business_id from core_member where user_id = $1 limit 1',
		[userId]
	);

	if (membership.rows[0]) return { businessId: membership.rows[0].business_id, created: false };

	const businessId = randomUUID();
	await client.query('select set_config($1, $2, true)', ['cjs.business_id', businessId]);

	await client.query(
		`insert into core_business (business_id, trading_name, city, country)
		 values ($1, $2, 'Cape Town', 'ZA')`,
		[businessId, BUSINESS]
	);
	// Owner, not staff — the seeded developer has to be able to add and remove modules.
	await client.query(
		`insert into core_member (business_id, user_id, role) values ($1, $2, 'owner')`,
		[businessId, userId]
	);

	return { businessId, created: true };
}

/** Exported so an integration test can assert the seeded account actually signs in. */
export async function seed(connectionString: string): Promise<SeedResult> {
	assertLocal(connectionString);

	const client = new pg.Client({ connectionString });
	await client.connect();

	try {
		// One transaction: a user with no business would be seeded straight into onboarding,
		// which is the state this script exists to avoid.
		await client.query('begin');
		const { userId, created: userCreated } = await upsertUser(client);
		const { businessId, created: businessCreated } = await ensureBusiness(client, userId);
		await client.query('commit');

		return {
			email: EMAIL,
			password: PASSWORD,
			userId,
			businessId,
			created: userCreated || businessCreated
		};
	} catch (error) {
		await client.query('rollback').catch(() => {});
		throw error;
	} finally {
		await client.end();
	}
}

async function main(): Promise<never> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('Set DATABASE_URL. `bun run db:dev` starts a local Postgres and prints it.');
		process.exit(2);
	}

	try {
		const result = await seed(url);
		console.info(
			`\n${result.created ? '✓ Seeded' : '✓ Already seeded'} — sign in at /sign-in with:\n\n` +
				`  email:    ${result.email}\n` +
				`  password: ${result.password}\n\n` +
				`  business: ${BUSINESS} (${result.businessId})\n`
		);
		process.exit(0);
	} catch (error) {
		console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}

// Only when executed directly — importing this from a test must not exit the process.
if (import.meta.main) await main();
