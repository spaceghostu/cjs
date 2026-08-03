/**
 * IDENTITY — the one non-tenant data domain.
 *
 * better-auth's tables live in their own Postgres schema, deliberately outside every
 * platform invariant, because they cannot satisfy them:
 *
 *  - They have no `business_id`. A tenant RLS policy would evaluate NULL, return zero
 *    rows, and nobody could ever sign in.
 *  - They must be DELETABLE. Sign-out deletes a session; consuming a magic link deletes a
 *    verification; unlinking a provider deletes an account. The platform's blanket
 *    `REVOKE DELETE` — which is what makes "business records are never destroyed"
 *    structural — would break sign-in entirely.
 *
 * So: `identity` schema, RLS off, full DML granted, and `scripts/invariants.sql` exempts
 * `identity`, `app`, `audit` and `drizzle` by name. Every OTHER table in the database is
 * required to carry `business_id uuid not null`, which is the invariant that actually
 * catches the mistake we care about (a "global lookup table" someone believed needed no
 * tenant column).
 *
 * VERIFYING THIS FILE
 * -------------------
 * `@better-auth/cli generate` cannot read our auth config — it loads the file with jiti,
 * which does not resolve SvelteKit's `$app/*` and `$env/*` aliases. (The scaffold's
 * `auth:schema` script was broken for the same reason from the moment auth.ts imported
 * them.) It would also overwrite this file, losing the `identity` schema placement.
 *
 * So the shape is proven by round-tripping better-auth's own adapter against a real
 * database instead — see `identity.test.ts`. That is the stronger check: it proves the
 * columns WORK, not that the generated text matches. If a future better-auth upgrade or
 * plugin adds a table or a column, that test fails with the exact missing field.
 */
import { pgSchema, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const identitySchema = pgSchema('identity');

export const user = identitySchema.table('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const session = identitySchema.table('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const account = identitySchema.table('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const verification = identitySchema.table('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
