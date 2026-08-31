-- ─────────────────────────────────────────────────────────────────────────────────────
-- JOBS — WHAT `generate` CANNOT SEE
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- `0009` created `core_job` and added the two nullable `job_id` columns. What it could not
-- create is everything that makes them TRUE: the tenant-scoped composite foreign keys, row
-- level security, the policy that is the security model, and the two triggers every table on
-- this floor carries. None of it has a Drizzle representation.
--
-- Hand-written here in the same shape as the second half of `0008_inventory.sql`, and asserted
-- independently by `scripts/invariants.sql` and by `src/lib/server/core/db/schema/jobs.test.ts`.
--
-- THESE TWO FILES ARE ONE CHANGE, AND MUST BE APPLIED AS ONE.
--
-- `0005_quoting`, `0007_invoicing` and `0008_inventory` each CREATE their tables and ENABLE row
-- security on them in a single file. This change is split across two because `0009` is
-- generated and `0010` is hand-written, so between the two files `core_job` exists with the
-- application role already holding SELECT/INSERT/UPDATE on it — from `0003`'s default
-- privileges — and NO row security at all. `loadJob` and `listJobs` carry no `business_id`
-- predicate by design, because the policy is supposed to have decided that already; in that
-- intermediate state they would return every tenant's jobs.
--
-- Nothing reaches that state through the migrator: drizzle-orm wraps all pending migrations in
-- ONE transaction, so `0009` and `0010` commit together or not at all, and this file failing
-- rolls that file back. The window opens only if somebody applies these `.sql` files to a
-- database by hand, one at a time — which is a realistic thing to reach for here, because
-- `bun run db:migrate` has been observed exiting non-zero with nothing on stdout or stderr, and
-- it is `drizzle-kit migrate && bun run db:verify`, so a failure there means the invariant check
-- never runs either.
--
-- Folding these statements up into `0009` would be the real fix and is no longer available:
-- `0009` is journalled, and editing an applied migration is how a schema and its history stop
-- agreeing. So the rule instead is that these files are never applied separately, and that
-- anything applied by hand is followed by `bun run db:verify` — which asserts the RLS below
-- rather than assuming it.
--
-- GRANTS NEED NO STATEMENT. `ALTER DEFAULT PRIVILEGES` in `0003_platform.sql` already gives the
-- application role SELECT/INSERT/UPDATE on every future table in `public`, and no DELETE. Which
-- is exactly right here: a job is ARCHIVED, never deleted. A job that has been invoiced is part
-- of the record of what a business did, and a business that wants it out of its list wants it
-- out of its list rather than out of history.

-- ── The composite foreign keys ───────────────────────────────────────────────────────
--
-- `(business_id, job_id) -> core_job (business_id, id)` rather than `job_id -> id`, on both the
-- quote and the invoice.
--
-- Postgres performs referential integrity with row security BYPASSED — a foreign key check is
-- not a query the policy sees. So a single-column key would cheerfully accept business A's quote
-- pointing at business B's job: every screen would still show the right rows, and the link
-- underneath would be a cross-tenant reference that nothing in the system objects to. The
-- composite form makes it a database error instead, which is the only version of that guarantee
-- worth making.
--
-- MATCH SIMPLE is the default, and it skips the check entirely when ANY column of the key is
-- NULL. So `job_id IS NULL` still passes, and the permanent nullability both columns need —
-- a quote sent before there is any job, a walk-in invoice that never has one — is untouched.

ALTER TABLE "quoting_quote"
	ADD CONSTRAINT "quoting_quote_job_fk"
	FOREIGN KEY ("business_id", "job_id")
	REFERENCES "public"."core_job"("business_id", "id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "invoicing_invoice"
	ADD CONSTRAINT "invoicing_invoice_job_fk"
	FOREIGN KEY ("business_id", "job_id")
	REFERENCES "public"."core_job"("business_id", "id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- ── Row Level Security ───────────────────────────────────────────────────────────────
--
-- ENABLE and FORCE, and the identical one-expression policy every other table carries. ENABLE
-- alone leaves the table's OWNER exempt, and migrations run as the owner.
--
-- THIS POLICY IS ALSO WHAT ADMITS THE AUTOMATIC CREATION. A job is created inside
-- `actAsSharedTenant` (`src/lib/server/core/share.ts`), which is `runScoped(businessId, null, …)`
-- — `cjs.business_id` set from a row the SHARE TOKEN admitted, and `cjs.user_id` empty, because
-- the client answering an emailed link genuinely is not a user. The existing
-- `quoting_quote_event` insert in that same transaction is the standing proof that a no-user
-- tenant write is admitted by an ordinary `tenant_isolation` policy.
--
-- NO `document_share` POLICY IS ADDED HERE, and none is wanted. The four SELECT-only policies in
-- `0006_quote_sharing.sql` are deliberately the entire public surface of this database: one
-- quote, its lines, its customer, its business. The client never reads the job, and adding a
-- fifth policy to a set whose smallness IS the security argument would be the beginning of the
-- end of that argument.

ALTER TABLE "core_job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_job" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "core_job"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint

-- ── updated_at ───────────────────────────────────────────────────────────────────────

CREATE TRIGGER "core_job_touch" BEFORE UPDATE ON "core_job"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint

-- ── Audit ────────────────────────────────────────────────────────────────────────────
--
-- A job is the thing a quote and an invoice are both about, so "who changed this, and when"
-- is the question that settles an argument about either of them. The row-change log is the one
-- record the application cannot rewrite (audit holds INSERT and SELECT, nothing else; see 0003).

CREATE TRIGGER "core_job_audit" AFTER INSERT OR UPDATE OR DELETE ON "core_job"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT IS DELIBERATELY ABSENT
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- THERE IS NO STATUS-TRANSITION TRIGGER, and there should not be. `core_job_status_known`
-- checks MEMBERSHIP — an unknown status is unstorable — and nothing checks ORDERING. A job may
-- go from `done` back to `in_progress`, because a business that has to return and refit a hinge
-- should not have to argue with its software about whether that is allowed.
--
-- Nor is there anything that CLOSES a job. Settling every invoice against a job leaves its
-- status byte-identical, because only the person who did the work knows whether the work is
-- finished. The guarantee that nothing closes a job automatically is that no code does it —
-- which is a guarantee a test can assert, where a trigger would only be one more rule to argue
-- around the first time a business genuinely reopens something.
--
-- The widened `core_document_number_type_known` CHECK needs no statement here either: `0009`
-- emitted the DROP and the ADD with `'job'` in the list, which was read and confirmed before
-- this file was written.
