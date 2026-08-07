CREATE TABLE "quoting_quote_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" text,
	"detail" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quoting_quote_event_kind_known" CHECK ("quoting_quote_event"."kind" in ('sent', 'viewed', 'accepted', 'declined', 'expired')),
	CONSTRAINT "quoting_quote_event_actor_known" CHECK ("quoting_quote_event"."actor" in ('business', 'client', 'system'))
);
--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "share_token_hash" text;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "share_token_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "first_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "last_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "accepted_by_name" text;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "quoting_quote_event" ADD CONSTRAINT "quoting_quote_event_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoting_quote_event" ADD CONSTRAINT "quoting_quote_event_quote_id_quoting_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quoting_quote"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quoting_quote_event_quote_idx" ON "quoting_quote_event" USING btree ("quote_id","occurred_at");--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD CONSTRAINT "quoting_quote_share_token_unique" UNIQUE("share_token_hash");--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD CONSTRAINT "quoting_quote_share_token_complete" CHECK (("quoting_quote"."share_token_hash" is null and "quoting_quote"."share_token_issued_at" is null)
			 or ("quoting_quote"."share_token_hash" is not null and "quoting_quote"."share_token_issued_at" is not null));--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD CONSTRAINT "quoting_quote_view_count_not_negative" CHECK ("quoting_quote"."view_count" >= 0);

-- ─────────────────────────────────────────────────────────────────────────────────────
-- THE ONE SURFACE A PERSON WITHOUT AN ACCOUNT EVER TOUCHES
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- The catalogue describes Quoting as "Branded quotes clients can accept online", so
-- acceptance happens outside the authenticated shell. A client has no account, no session and
-- no membership — and `tenant_isolation` needs a business id that nobody has given it.
--
-- The two tempting shortcuts are both holes in the floor:
--
--   * read the token on an unscoped connection, which puts one query in the product that RLS
--     does not constrain, or
--   * resolve the tenant from the token and then open an ordinary scoped transaction, which
--     hands an unauthenticated request the reach of the whole business and leaves only the
--     route's good behaviour between it and every other document.
--
-- Instead the loop closes inside the model, exactly as `member_sees_own_membership` does for
-- sign-in. `runWithShareToken` sets `cjs.share_token` AND NOTHING ELSE — no business id, no
-- user — and the four policies below admit precisely one quote, its lines, its customer and
-- its business. Every other table, and every other row of those four, still evaluates
-- `business_id = NULL` and returns nothing.
--
-- The blast radius of the public page is therefore a property of this file rather than of the
-- code that calls it, which is the only version of that claim worth making.
--
-- SELECT ONLY, all four. Accepting and declining are WRITES and still go through
-- `tenant_isolation`: `accept.ts` resolves the tenant through the token and then performs one
-- bounded update as that tenant.

CREATE OR REPLACE FUNCTION "app".current_share_token() RETURNS text
	LANGUAGE sql
	STABLE
	PARALLEL SAFE
	SET search_path = pg_catalog
	AS $$ SELECT nullif(current_setting('cjs.share_token', true), '') $$;
--> statement-breakpoint

-- The document itself. `share_token_hash IS NOT NULL` is not redundant with the equality:
-- without it, a request that set the variable to a value matching NULL semantics would be
-- comparing against every unsent quote in the database. Being explicit costs nothing.
CREATE POLICY "document_share" ON "quoting_quote"
	FOR SELECT
	USING (
		"share_token_hash" IS NOT NULL
		AND "app".current_share_token() IS NOT NULL
		AND "share_token_hash" = "app".current_share_token()
	);
--> statement-breakpoint

CREATE POLICY "document_share" ON "quoting_quote_line"
	FOR SELECT
	USING (
		"quote_id" IN (
			SELECT "q"."id" FROM "quoting_quote" "q"
			 WHERE "q"."share_token_hash" IS NOT NULL
			   AND "app".current_share_token() IS NOT NULL
			   AND "q"."share_token_hash" = "app".current_share_token()
		)
	);
--> statement-breakpoint

-- The customer the document is addressed to. Needed because the sheet prints their name, and
-- reachable ONLY as the customer of the one quote the token opens.
CREATE POLICY "document_share" ON "core_customer"
	FOR SELECT
	USING (
		"id" IN (
			SELECT "q"."customer_id" FROM "quoting_quote" "q"
			 WHERE "q"."share_token_hash" IS NOT NULL
			   AND "app".current_share_token() IS NOT NULL
			   AND "q"."share_token_hash" = "app".current_share_token()
		)
	);
--> statement-breakpoint

-- The masthead: trading name, address, VAT number, phone. All of it is already on the PDF in
-- the client's inbox, which is the test for whether a public page may show it.
CREATE POLICY "document_share" ON "core_business"
	FOR SELECT
	USING (
		"business_id" IN (
			SELECT "q"."business_id" FROM "quoting_quote" "q"
			 WHERE "q"."share_token_hash" IS NOT NULL
			   AND "app".current_share_token() IS NOT NULL
			   AND "q"."share_token_hash" = "app".current_share_token()
		)
	);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- THE EVENT LOG
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- A tenant table like any other, with the same policy shape and the same triggers. Audited as
-- well as being an audit: the row-change log is the copy the application cannot rewrite.

ALTER TABLE "quoting_quote_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quoting_quote_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "quoting_quote_event"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint

CREATE TRIGGER "quoting_quote_event_touch" BEFORE UPDATE ON "quoting_quote_event"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER "quoting_quote_event_audit" AFTER INSERT OR UPDATE OR DELETE ON "quoting_quote_event"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
