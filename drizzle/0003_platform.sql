-- THE PLATFORM FLOOR.
--
-- 0002 created the core tables. On its own that is a multi-tenant database in name only:
-- every row is visible to every connection. This migration is what makes tenancy real, and
-- none of it has a Drizzle representation — policies, grants, triggers and functions are
-- invisible to `drizzle-kit generate`, which is exactly why `drizzle-kit push` is not
-- exposed as a script. Push reconciles tables and would drop every line below.
--
-- Four things happen here, in order:
--
--   1. `app` — the two functions that read the request's tenant context out of the session.
--   2. Row Level Security — enabled AND forced on every tenant table, with one policy shape.
--   3. Grants — SELECT/INSERT/UPDATE for the application role. No DELETE, anywhere.
--   4. Audit — the trigger that records every change, into a table the app cannot rewrite.
--
-- `scripts/invariants.sql` asserts all four independently, so a future migration that
-- weakens one fails CI rather than quietly turning tenant isolation off.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 1. THE `app` SCHEMA — request context
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Exempt from the `business_id` invariant by name, along with `identity`, `audit` and
-- `drizzle`. It holds functions only: there is nothing here to be a tenant of.

CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint

-- The application role may CALL what lives here and create nothing in it.
REVOKE CREATE ON SCHEMA "app" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "app" TO "cjs_app";
--> statement-breakpoint

-- The tenant, as the current transaction sees it.
--
-- `current_setting(name, true)` — note the `true` — returns NULL for an unset variable
-- instead of raising. That is deliberate and load-bearing: it means a request that never
-- established a business context evaluates every policy to `business_id = NULL`, which is
-- NULL, which is not TRUE, which is ZERO ROWS. The failure mode of forgetting to set the
-- context is an empty screen, never someone else's invoices.
--
-- The `::uuid` cast raises on a malformed value rather than falling back to NULL. A garbage
-- session variable is a bug or an attack, and neither should get a quiet empty result.
CREATE OR REPLACE FUNCTION "app".current_business_id() RETURNS uuid
	LANGUAGE sql
	STABLE
	PARALLEL SAFE
	SET search_path = pg_catalog
	AS $$ SELECT nullif(current_setting('cjs.business_id', true), '')::uuid $$;
--> statement-breakpoint

-- Who is acting. Drives audit attribution, and lets a signed-in person see the businesses
-- they belong to before any one of them has been chosen.
CREATE OR REPLACE FUNCTION "app".current_user_id() RETURNS text
	LANGUAGE sql
	STABLE
	PARALLEL SAFE
	SET search_path = pg_catalog
	AS $$ SELECT nullif(current_setting('cjs.user_id', true), '') $$;
--> statement-breakpoint

-- `updated_at` maintained by the database, so a hand-written UPDATE in a migration or a
-- psql session cannot leave a stale timestamp behind.
CREATE OR REPLACE FUNCTION "app".touch_updated_at() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog
	AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END $$;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- ENABLE is not enough on its own. `FORCE` is what makes the policy apply to the table's
-- OWNER as well — without it, anything connecting as `cjs_owner` sees every tenant's rows,
-- and the difference between the two roles becomes the only thing standing between a
-- misconfigured connection string and a cross-tenant data leak.
--
-- Every policy below is the same expression, because `core_business.business_id` is the
-- business's own primary key. One shape, no exceptions, nothing to remember.

ALTER TABLE "core_business" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "core_business" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "core_member" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "core_member" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "core_customer" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "core_customer" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "core_document_number" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "core_document_number" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit"."row_change" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit"."row_change" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "core_business"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core_member"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core_customer"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core_document_number"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit"."row_change"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint

-- THE ONE THING THAT HAPPENS BEFORE A TENANT EXISTS.
--
-- Sign-in has a chicken-and-egg problem: to set `cjs.business_id` the request must first
-- know which businesses this person belongs to, and that answer lives in a tenant table.
--
-- The alternative — a SECURITY DEFINER function reading `core_member` with the owner's
-- rights — would put a deliberate hole in the floor and make "there is no way around RLS"
-- false. These two SELECT-only policies close the loop inside the model instead: a person
-- may always see their own membership rows, and the businesses those rows point at. They
-- widen nobody's access to anything they were not already a member of, and with no session
-- variables set at all they evaluate `= NULL` and return nothing, like everything else.
--
-- SELECT only. Writes still go exclusively through `tenant_isolation`.
CREATE POLICY "member_sees_own_membership" ON "core_member"
	FOR SELECT
	USING ("user_id" = "app".current_user_id());
--> statement-breakpoint
CREATE POLICY "member_sees_own_business" ON "core_business"
	FOR SELECT
	USING (
		"business_id" IN (
			SELECT "m"."business_id" FROM "core_member" "m"
			 WHERE "m"."user_id" = "app".current_user_id()
		)
	);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 3. GRANTS — and the DELETE that is never granted
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- "Business records are never destroyed" is a promise the product makes to people whose tax
-- records these are. A promise enforced by code review is not enforced. The application role
-- simply has no DELETE privilege on any table outside `identity`, so the strongest statement
-- a bug can make is `UPDATE ... SET archived_at = now()`.

GRANT USAGE ON SCHEMA "public" TO "cjs_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA "public" TO "cjs_app";
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "public" FROM "cjs_app";
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO "cjs_app";
--> statement-breakpoint

-- Every table a future module migration creates inherits exactly this, so a new module
-- never has to remember the grant — and never accidentally grants itself DELETE.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
	GRANT SELECT, INSERT, UPDATE ON TABLES TO "cjs_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
	GRANT USAGE, SELECT ON SEQUENCES TO "cjs_app";
--> statement-breakpoint

-- Audit is append-only as a GRANT, not as a convention: INSERT and SELECT, nothing else.
-- A log the application can rewrite is not evidence of anything.
GRANT USAGE ON SCHEMA "audit" TO "cjs_app";
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit"."row_change" TO "cjs_app";
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "audit"."row_change" FROM "cjs_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "audit" GRANT SELECT, INSERT ON TABLES TO "cjs_app";
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 4. AUDIT
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER on purpose. The insert runs as the application role and is therefore
-- subject to the same RLS policy as everything else, which means an audit row can only ever
-- be written for the business the transaction is already acting as. A SECURITY DEFINER
-- trigger could write an entry attributed to anyone.
--
-- The primary key columns are passed as trigger arguments, so one function serves every
-- table regardless of whether its key is `id` or a composite.
CREATE OR REPLACE FUNCTION "app".log_row_change() RETURNS trigger
	LANGUAGE plpgsql
	SECURITY INVOKER
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	v_before jsonb;
	v_after  jsonb;
	v_row    jsonb;
	v_key    text;
	v_parts  text[] := '{}';
BEGIN
	IF TG_OP <> 'INSERT' THEN v_before := to_jsonb(OLD); END IF;
	IF TG_OP <> 'DELETE' THEN v_after  := to_jsonb(NEW); END IF;

	v_row := coalesce(v_after, v_before);

	FOREACH v_key IN ARRAY TG_ARGV LOOP
		v_parts := v_parts || coalesce(v_row ->> v_key, '');
	END LOOP;

	INSERT INTO audit.row_change
		(business_id, actor_user_id, table_name, op, row_id, before, after)
	VALUES (
		(v_row ->> 'business_id')::uuid,
		app.current_user_id(),
		TG_TABLE_NAME,
		TG_OP,
		array_to_string(v_parts, '/'),
		v_before,
		v_after
	);

	RETURN NULL;
END $$;
--> statement-breakpoint

CREATE TRIGGER "core_business_touch" BEFORE UPDATE ON "core_business"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "core_member_touch" BEFORE UPDATE ON "core_member"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "core_customer_touch" BEFORE UPDATE ON "core_customer"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "core_document_number_touch" BEFORE UPDATE ON "core_document_number"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint

-- Audited: who the tenant is, who may act for it, and who it sells to. Every one of these
-- answers a question someone may later have to defend.
--
-- `core_document_number` is deliberately NOT audited. It changes on every allocation and
-- records nothing the documents themselves do not already say; logging it would bury the
-- entries that matter under a counter.
CREATE TRIGGER "core_business_audit" AFTER INSERT OR UPDATE OR DELETE ON "core_business"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('business_id');
--> statement-breakpoint
CREATE TRIGGER "core_member_audit" AFTER INSERT OR UPDATE OR DELETE ON "core_member"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "core_customer_audit" AFTER INSERT OR UPDATE OR DELETE ON "core_customer"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
