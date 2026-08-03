-- THE FLOOR, ASSERTED.
--
-- Every comment in this codebase that says "the platform invariants" means this file. It is
-- the difference between an architecture that is documented and one that is true.
--
-- Each assertion below describes a mistake that is easy to make, invisible in testing, and
-- catastrophic in production — a new table without a tenant column, a policy someone
-- enabled but forgot to force, a DELETE grant that crept in with a module migration, a
-- connection string pointed at the owner. All four fail the same way: everything appears to
-- work perfectly while businesses can read each other's records.
--
--   bun run db:verify
--   psql -v ON_ERROR_STOP=1 "$DATABASE_MIGRATION_URL" -f scripts/invariants.sql
--
-- (ON_ERROR_STOP is not optional with psql: without it psql prints the failure and still
-- exits 0, which in CI is indistinguishable from passing. `bun run db:verify` exits 1.)
--
-- Run in CI and after every migration, not by hand when someone remembers.
--
-- The application role defaults to `cjs_app` and can be overridden for a deployment that
-- names it differently:
--
--   CJS_APP_ROLE=myapp bun run db:verify
--
-- EXEMPT SCHEMAS, and why each one is exempt:
--
--   identity  better-auth's tables. No business_id (a tenant policy would evaluate NULL and
--             nobody could sign in) and DELETE is required (sign-out deletes a session).
--   app       functions only. There is nothing here to be a tenant of.
--   audit     the record of what happened to a tenant, not a tenant domain. It carries
--             business_id and enforces RLS anyway — it is exempt from the *requirement*.
--   drizzle   migration bookkeeping.

DO $invariants$
DECLARE
	v_role   text := coalesce(nullif(current_setting('cjs.app_role', true), ''), 'cjs_app');
	v_faults text[] := '{}';
	v_row    record;
	v_super  boolean;
	v_bypass boolean;
	v_count  bigint;
BEGIN
	-- ── 0. The role must exist ───────────────────────────────────────────────────────
	SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
	  FROM pg_roles WHERE rolname = v_role;

	IF NOT FOUND THEN
		RAISE EXCEPTION
			'INVARIANT: the application role "%" does not exist. Provision it before migrating (locally: bun run db:dev), or set cjs.app_role to the role this deployment uses.',
			v_role;
	END IF;

	-- ── 1. Every tenant table carries business_id uuid NOT NULL ──────────────────────
	--
	-- This is the invariant that catches the mistake we actually care about: a "global
	-- lookup table" someone believed needed no tenant column, which then silently pools
	-- every business's data into one list.
	FOR v_row IN
		SELECT n.nspname AS schema, c.relname AS table
		  FROM pg_class c
		  JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE c.relkind IN ('r', 'p')
		   AND n.nspname NOT IN ('identity', 'app', 'audit', 'drizzle',
		                         'pg_catalog', 'information_schema')
		   AND n.nspname NOT LIKE 'pg\_%'
		   AND NOT EXISTS (
		       SELECT 1 FROM pg_attribute a
		        WHERE a.attrelid = c.oid
		          AND a.attname = 'business_id'
		          AND a.attnum > 0
		          AND NOT a.attisdropped
		          AND a.atttypid = 'uuid'::regtype
		          AND a.attnotnull
		   )
		 ORDER BY 1, 2
	LOOP
		v_faults := v_faults || format(
			'%I.%I has no "business_id uuid NOT NULL". Every table outside identity/app/audit/drizzle is a tenant table. Use businessId() from $lib/server/core/db/base.',
			v_row.schema, v_row.table);
	END LOOP;

	-- ── 2. RLS enabled AND forced on every one of them ───────────────────────────────
	--
	-- ENABLE alone leaves the table's OWNER exempt. Since migrations run as the owner and
	-- the two roles can be accidentally collapsed into one connection string, an unforced
	-- policy is a policy that is one .env mistake away from doing nothing.
	FOR v_row IN
		SELECT n.nspname AS schema, c.relname AS table,
		       c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
		  FROM pg_class c
		  JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE c.relkind IN ('r', 'p')
		   AND n.nspname NOT IN ('identity', 'app', 'audit', 'drizzle',
		                         'pg_catalog', 'information_schema')
		   AND n.nspname NOT LIKE 'pg\_%'
		   AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
		 ORDER BY 1, 2
	LOOP
		v_faults := v_faults || format(
			'%I.%I: row level security is %s and %s. Both are required — ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;',
			v_row.schema, v_row.table,
			CASE WHEN v_row.enabled THEN 'enabled' ELSE 'NOT ENABLED' END,
			CASE WHEN v_row.forced  THEN 'forced'  ELSE 'NOT FORCED'  END);
	END LOOP;

	-- ── 3. The application role holds no DELETE outside identity ─────────────────────
	--
	-- "Business records are never destroyed" is structural, not a policy. The strongest
	-- statement a bug can make is an UPDATE that sets archived_at.
	FOR v_row IN
		SELECT n.nspname AS schema, c.relname AS table
		  FROM pg_class c
		  JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE c.relkind IN ('r', 'p')
		   AND n.nspname NOT IN ('identity', 'pg_catalog', 'information_schema')
		   AND n.nspname NOT LIKE 'pg\_%'
		   AND has_table_privilege(v_role, c.oid, 'DELETE')
		 ORDER BY 1, 2
	LOOP
		v_faults := v_faults || format(
			'%I.%I: role "%s" holds DELETE. Revoke it — archive with a column, never remove a row.',
			v_row.schema, v_row.table, v_role);
	END LOOP;

	-- TRUNCATE destroys just as thoroughly and is not covered by the DELETE grant.
	FOR v_row IN
		SELECT n.nspname AS schema, c.relname AS table
		  FROM pg_class c
		  JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE c.relkind IN ('r', 'p')
		   AND n.nspname NOT LIKE 'pg\_%'
		   AND n.nspname NOT IN ('pg_catalog', 'information_schema')
		   AND has_table_privilege(v_role, c.oid, 'TRUNCATE')
		 ORDER BY 1, 2
	LOOP
		v_faults := v_faults || format(
			'%I.%I: role "%s" holds TRUNCATE, which empties a table without a single DELETE.',
			v_row.schema, v_row.table, v_role);
	END LOOP;

	-- ── 4. The application role cannot bypass any of the above ───────────────────────
	--
	-- FORCE ROW LEVEL SECURITY does not apply to a superuser, to a role with BYPASSRLS, or
	-- to a table's owner. A role that is any of the three turns every policy in this
	-- database into decoration. `assertDatabaseRoleIsSafe()` checks the first two again at
	-- boot, from the application's own connection, because this file proves it about a
	-- role name and that one proves it about the connection actually in use.
	IF v_super THEN
		v_faults := v_faults || format(
			'role "%s" is a SUPERUSER. Row level security does not apply to it.', v_role);
	END IF;
	IF v_bypass THEN
		v_faults := v_faults || format(
			'role "%s" has BYPASSRLS. Row level security does not apply to it.', v_role);
	END IF;

	SELECT count(*) INTO v_count
	  FROM pg_class c
	  JOIN pg_namespace n ON n.oid = c.relnamespace
	 WHERE c.relowner = v_role::regrole
	   AND n.nspname NOT LIKE 'pg\_%';
	IF v_count > 0 THEN
		v_faults := v_faults || format(
			'role "%s" owns % relation(s). A table''s owner is exempt from its own policies unless FORCE is set, so the application role must own nothing at all.',
			v_role, v_count);
	END IF;

	SELECT count(*) INTO v_count
	  FROM pg_namespace WHERE nspowner = v_role::regrole AND nspname NOT LIKE 'pg\_%';
	IF v_count > 0 THEN
		v_faults := v_faults || format(
			'role "%s" owns % schema(s). Owning a schema means being able to create in it, and a table it creates would not inherit the platform grants.',
			v_role, v_count);
	END IF;

	SELECT count(*) INTO v_count FROM pg_proc WHERE proowner = v_role::regrole;
	IF v_count > 0 THEN
		v_faults := v_faults || format(
			'role "%s" owns % function(s). The functions the policies call must not be replaceable by the role they constrain.',
			v_role, v_count);
	END IF;

	-- ── 5. …and cannot create a table that would dodge assertions 1–3 ────────────────
	FOR v_row IN
		SELECT nspname AS schema FROM pg_namespace
		 WHERE nspname NOT LIKE 'pg\_%'
		   AND nspname NOT IN ('pg_catalog', 'information_schema')
		   AND has_schema_privilege(v_role, oid, 'CREATE')
		 ORDER BY 1
	LOOP
		v_faults := v_faults || format(
			'role "%s" holds CREATE on schema %I. It could then define a table with no business_id and no policies. REVOKE CREATE ON SCHEMA %I FROM %I;',
			v_role, v_row.schema, v_row.schema, v_role);
	END LOOP;

	-- ── Report ───────────────────────────────────────────────────────────────────────
	IF array_length(v_faults, 1) > 0 THEN
		RAISE EXCEPTION E'PLATFORM INVARIANTS VIOLATED (%)\n\n  - %\n',
			array_length(v_faults, 1),
			array_to_string(v_faults, E'\n  - ')
		USING HINT = 'See scripts/invariants.sql. Each line names the table and the fix.';
	END IF;

	RAISE NOTICE 'Platform invariants hold for role "%".', v_role;
END
$invariants$;
