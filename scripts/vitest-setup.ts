/**
 * THE ONE THING EVERY DATABASE TEST IN THIS REPO SILENTLY DEPENDED ON, NOW CHECKED ONCE.
 *
 * A large part of this suite makes assertions about Row Level Security: that a tenant cannot
 * read another tenant's rows, that a rival's real record and a record that never existed are
 * refused identically, that a share token bounds what it opens. Every one of those assertions
 * is worth exactly nothing if the connection the tests use can bypass a policy — and RLS does
 * not apply to a SUPERUSER, to a role holding BYPASSRLS, or to the table owner.
 *
 * That is not a hypothetical here. `.env` points `DATABASE_URL` at the owner role because that
 * is the role migrations need, `.env.local` overrides it with the unprivileged application
 * role, and Bun does not load `.env.local` when `NODE_ENV=test` — which is precisely what
 * Vitest sets. So the default state of an unconfigured checkout is that the whole suite runs as
 * the owner, every policy in the system is decorative for the duration, and the tests that
 * exist to prove tenant isolation pass by walking around it rather than through it. A green
 * suite in that state is worse than a red one, because it is a green suite that proves nothing.
 *
 * `assertDatabaseRoleIsSafe` is the same check `hooks.server.ts` runs at boot; it names the
 * fault and the fix in its message and it memoises itself, so this costs one query per worker
 * process and nothing thereafter. It runs HERE, as a setup file for the whole `unit` project,
 * rather than in the individual suites that care — `not-found.test.ts` calls it in its own
 * `beforeAll` and is currently the only file in the repo that refuses to run vacuously, which
 * guards one file out of a dozen. The floor belongs to the suite, not to whichever author
 * remembered it.
 *
 * IT THROWS RATHER THAN SKIPS, deliberately. A tenancy check that quietly opts out when it
 * cannot be proved is exactly the guard a later tidy-up deletes while the suite stays green.
 *
 * THE FIX WHEN THIS FIRES is to point `DATABASE_URL` at the application role for tests — a
 * local `.env.test` carrying that one line is enough, and it is deliberately NOT committed
 * because it holds a live credential.
 */
import { beforeAll } from 'vitest';
import { assertDatabaseRoleIsSafe } from '$lib/server/core/db/client';

beforeAll(async () => {
	await assertDatabaseRoleIsSafe();
}, 30_000);
