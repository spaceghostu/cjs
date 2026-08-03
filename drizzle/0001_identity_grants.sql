-- IDENTITY GRANTS
--
-- `identity` is the ONE non-tenant data domain in this database, and the only schema where
-- the application role holds DELETE.
--
-- It has to be. better-auth deletes a session on sign-out, deletes a verification when a
-- magic link is consumed, and deletes an account when a provider is unlinked. The platform's
-- blanket `REVOKE DELETE` — which is what makes "business records are never destroyed"
-- structural rather than a policy — would break sign-in entirely if it applied here.
--
-- Correspondingly, identity tables carry no `business_id` and no Row Level Security: they
-- must be readable BEFORE any business context exists, or nobody could ever sign in.
-- `scripts/invariants.sql` exempts `identity`, `app`, `audit` and `drizzle` by name, and
-- requires every table in every OTHER schema to carry `business_id uuid not null`.
--
-- ROLES ARE PROVISIONED OUTSIDE MIGRATIONS. Creating a role needs CREATEROLE or superuser,
-- which the DDL role deliberately does not have. Locally, `bun run db:dev` creates them; in
-- production they are created once by the DBA. This migration only grants to a role that
-- already exists.

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cjs_app') THEN
		RAISE EXCEPTION
			'Role "cjs_app" does not exist. Provision the application role before migrating (locally: bun run db:dev).';
	END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA "identity" TO "cjs_app";
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "identity" TO "cjs_app";
--> statement-breakpoint

-- Future identity tables (better-auth plugins add their own) inherit the same grants, so a
-- new plugin never silently fails at runtime with a permission error.
ALTER DEFAULT PRIVILEGES IN SCHEMA "identity"
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "cjs_app";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA "identity" GRANT USAGE, SELECT ON SEQUENCES TO "cjs_app";
