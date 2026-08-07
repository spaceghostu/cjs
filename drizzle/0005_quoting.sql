CREATE TABLE "quoting_quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"customer_contact_person" text,
	"customer_email" text,
	"customer_phone" text,
	"customer_vat_number" text,
	"customer_address_line1" text,
	"customer_address_line2" text,
	"customer_city" text,
	"customer_postal_code" text,
	"customer_country" text DEFAULT 'ZA' NOT NULL,
	"send_to_name" text,
	"send_to_email" text,
	"number_prefix" text,
	"number_value" integer,
	"number_formatted" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"valid_until" date,
	"deposit_rate_ppm" bigint,
	"deposit_amount_cents" bigint,
	"pricing_mode" text DEFAULT 'exclusive' NOT NULL,
	"tax_engine" text DEFAULT 'za_vat' NOT NULL,
	"vat_rate_ppm" bigint DEFAULT 150000 NOT NULL,
	"vat_policy" text NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"snapshot_subtotal_cents" bigint,
	"snapshot_tax_cents" bigint,
	"snapshot_total_cents" bigint,
	"snapshot_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quoting_quote_id_currency" UNIQUE("id","currency"),
	CONSTRAINT "quoting_quote_number_unique" UNIQUE("business_id","number_formatted"),
	CONSTRAINT "quoting_quote_status_known" CHECK ("quoting_quote"."status" in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
	CONSTRAINT "quoting_quote_pricing_mode_known" CHECK ("quoting_quote"."pricing_mode" in ('exclusive', 'inclusive')),
	CONSTRAINT "quoting_quote_tax_engine_known" CHECK ("quoting_quote"."tax_engine" in ('za_vat', 'none')),
	CONSTRAINT "quoting_quote_currency_supported" CHECK ("quoting_quote"."currency" in ('ZAR')),
	CONSTRAINT "quoting_quote_customer_required_once_sent" CHECK ("quoting_quote"."status" = 'draft' or "quoting_quote"."customer_id" is not null),
	CONSTRAINT "quoting_quote_number_complete" CHECK (("quoting_quote"."number_prefix" is null and "quoting_quote"."number_value" is null and "quoting_quote"."number_formatted" is null)
			 or ("quoting_quote"."number_prefix" is not null and "quoting_quote"."number_value" is not null and "quoting_quote"."number_formatted" is not null)),
	CONSTRAINT "quoting_quote_number_required_once_sent" CHECK ("quoting_quote"."status" = 'draft' or "quoting_quote"."number_formatted" is not null),
	CONSTRAINT "quoting_quote_deposit_single_form" CHECK ("quoting_quote"."deposit_rate_ppm" is null or "quoting_quote"."deposit_amount_cents" is null),
	CONSTRAINT "quoting_quote_deposit_rate_fraction" CHECK ("quoting_quote"."deposit_rate_ppm" is null or ("quoting_quote"."deposit_rate_ppm" >= 0 and "quoting_quote"."deposit_rate_ppm" <= 1000000)),
	CONSTRAINT "quoting_quote_deposit_amount_not_negative" CHECK ("quoting_quote"."deposit_amount_cents" is null or "quoting_quote"."deposit_amount_cents" >= 0),
	CONSTRAINT "quoting_quote_deposit_rate_exact" CHECK (abs("quoting_quote"."deposit_rate_ppm") <= 9007199254740991),
	CONSTRAINT "quoting_quote_deposit_amount_exact" CHECK (abs("quoting_quote"."deposit_amount_cents") <= 9007199254740991),
	CONSTRAINT "quoting_quote_vat_rate_exact" CHECK (abs("quoting_quote"."vat_rate_ppm") <= 9007199254740991),
	CONSTRAINT "quoting_quote_snapshot_subtotal_exact" CHECK (abs("quoting_quote"."snapshot_subtotal_cents") <= 9007199254740991),
	CONSTRAINT "quoting_quote_snapshot_tax_exact" CHECK (abs("quoting_quote"."snapshot_tax_cents") <= 9007199254740991),
	CONSTRAINT "quoting_quote_snapshot_total_exact" CHECK (abs("quoting_quote"."snapshot_total_cents") <= 9007199254740991),
	CONSTRAINT "quoting_quote_snapshot_complete" CHECK (("quoting_quote"."snapshot_subtotal_cents" is null and "quoting_quote"."snapshot_tax_cents" is null
			     and "quoting_quote"."snapshot_total_cents" is null and "quoting_quote"."snapshot_at" is null)
			 or ("quoting_quote"."snapshot_subtotal_cents" is not null and "quoting_quote"."snapshot_tax_cents" is not null
			     and "quoting_quote"."snapshot_total_cents" is not null and "quoting_quote"."snapshot_at" is not null)),
	CONSTRAINT "quoting_quote_snapshot_reconciles" CHECK ("quoting_quote"."snapshot_total_cents" is null
			 or "quoting_quote"."snapshot_subtotal_cents" + "quoting_quote"."snapshot_tax_cents" = "quoting_quote"."snapshot_total_cents"),
	CONSTRAINT "quoting_quote_vat_policy_present" CHECK (length(btrim("quoting_quote"."vat_policy")) > 0)
);
--> statement-breakpoint
CREATE TABLE "quoting_quote_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"provenance" text,
	"document_description" text,
	"qty_e6" bigint NOT NULL,
	"unit_price_micros" bigint NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"tax_treatment" text DEFAULT 'standard' NOT NULL,
	"vat_rate_ppm" bigint DEFAULT 150000 NOT NULL,
	"source_item_id" uuid,
	"source_captured_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quoting_quote_line_description_present" CHECK (length(btrim("quoting_quote_line"."description")) > 0),
	CONSTRAINT "quoting_quote_line_tax_treatment_known" CHECK ("quoting_quote_line"."tax_treatment" in ('standard', 'zero_rated', 'exempt', 'no_vat')),
	CONSTRAINT "quoting_quote_line_currency_supported" CHECK ("quoting_quote_line"."currency" in ('ZAR')),
	CONSTRAINT "quoting_quote_line_qty_exact" CHECK (abs("quoting_quote_line"."qty_e6") <= 9007199254740991),
	CONSTRAINT "quoting_quote_line_unit_price_exact" CHECK (abs("quoting_quote_line"."unit_price_micros") <= 9007199254740991),
	CONSTRAINT "quoting_quote_line_vat_rate_exact" CHECK (abs("quoting_quote_line"."vat_rate_ppm") <= 9007199254740991),
	CONSTRAINT "quoting_quote_line_qty_not_negative" CHECK ("quoting_quote_line"."qty_e6" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quoting_setting" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"validity_days" integer DEFAULT 14 NOT NULL,
	"deposit_rate_ppm" bigint,
	"footer_terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quoting_setting_validity_sane" CHECK ("quoting_setting"."validity_days" between 1 and 365),
	CONSTRAINT "quoting_setting_deposit_rate_exact" CHECK (abs("quoting_setting"."deposit_rate_ppm") <= 9007199254740991),
	CONSTRAINT "quoting_setting_deposit_rate_fraction" CHECK ("quoting_setting"."deposit_rate_ppm" is null or ("quoting_setting"."deposit_rate_ppm" >= 0 and "quoting_setting"."deposit_rate_ppm" <= 1000000))
);
--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD CONSTRAINT "quoting_quote_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD CONSTRAINT "quoting_quote_customer_id_core_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."core_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoting_quote_line" ADD CONSTRAINT "quoting_quote_line_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quoting_setting" ADD CONSTRAINT "quoting_setting_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quoting_quote_business_status_idx" ON "quoting_quote" USING btree ("business_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "quoting_quote_customer_idx" ON "quoting_quote" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "quoting_quote_line_quote_idx" ON "quoting_quote_line" USING btree ("quote_id","position");
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT drizzle-kit CANNOT SEE
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Row Level Security, the `updated_at` trigger, the audit trigger and one COMPOSITE foreign
-- key have no Drizzle representation, so `generate` produced the three tables above and none
-- of what makes them tenant tables. Hand-written here in the same shape as `0003_platform.sql`
-- and `0004_absurd_jubilee.sql`, and asserted independently by `scripts/invariants.sql` — a
-- table that reached production without these would be visible to every business at once.
--
-- Grants are already covered: `ALTER DEFAULT PRIVILEGES` in 0003 gives the application role
-- SELECT/INSERT/UPDATE on every future table in `public`, and no DELETE. Which is exactly
-- right here: a discarded draft is archived, a removed line is archived, and a sent quote is
-- never unsent.

-- ── The composite foreign key ────────────────────────────────────────────────────────
--
-- `(quote_id, currency) -> quoting_quote (id, currency)` rather than `quote_id -> id`.
--
-- `core/money/types.ts` names this as the thing that makes a mixed-currency document a
-- database error rather than a silently wrong total: a line in another currency has no header
-- to point at, so it cannot be stored at all. The currency union is one value wide today,
-- which is exactly when this is cheap to put in — retrofitting it after the second currency
-- arrives means fixing the rows that are already wrong.
--
-- ON DELETE RESTRICT for the same reason every other reference in this database is: the
-- application holds no DELETE, and a CASCADE here would run as the table owner and reach
-- around that.
ALTER TABLE "quoting_quote_line"
	ADD CONSTRAINT "quoting_quote_line_quote_fk"
	FOREIGN KEY ("quote_id", "currency")
	REFERENCES "public"."quoting_quote"("id", "currency")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- ── Row Level Security ───────────────────────────────────────────────────────────────
--
-- ENABLE and FORCE, and the identical one-expression policy every other table carries.

ALTER TABLE "quoting_quote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quoting_quote" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quoting_quote_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quoting_quote_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quoting_setting" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quoting_setting" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "quoting_quote"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quoting_quote_line"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quoting_setting"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint

-- ── updated_at ───────────────────────────────────────────────────────────────────────
--
-- On `quoting_quote` this is not bookkeeping. It IS the editor's save indicator: "All changes
-- saved · 21:47" reads `updated_at`, so the timestamp has to be what the DATABASE did rather
-- than what the server intended to do. A trigger is the only version of that which cannot be
-- wrong.

CREATE TRIGGER "quoting_quote_touch" BEFORE UPDATE ON "quoting_quote"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "quoting_quote_line_touch" BEFORE UPDATE ON "quoting_quote_line"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "quoting_setting_touch" BEFORE UPDATE ON "quoting_setting"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint

-- ── Audit ────────────────────────────────────────────────────────────────────────────
--
-- A quote is a priced offer a client may act on. "This is what we sent you, on this date, at
-- this price" is a claim somebody may have to defend, and the row-change log is the only
-- record of it that the application cannot rewrite (audit holds INSERT and SELECT, nothing
-- else — see 0003).
--
-- Settings are audited too, more quietly: the default deposit percentage is a term of business
-- and a change to it should be traceable to a person and a moment.

CREATE TRIGGER "quoting_quote_audit" AFTER INSERT OR UPDATE OR DELETE ON "quoting_quote"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "quoting_quote_line_audit" AFTER INSERT OR UPDATE OR DELETE ON "quoting_quote_line"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "quoting_setting_audit" AFTER INSERT OR UPDATE OR DELETE ON "quoting_setting"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('business_id');
