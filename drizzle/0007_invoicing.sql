CREATE TABLE "core_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"document_kind" text NOT NULL,
	"document_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"occurred_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_allocation_document_known" CHECK ("core_allocation"."document_kind" in ('invoice')),
	CONSTRAINT "core_allocation_currency_supported" CHECK ("core_allocation"."currency" in ('ZAR')),
	CONSTRAINT "core_allocation_amount_exact" CHECK (abs("core_allocation"."amount_cents") <= 9007199254740991),
	CONSTRAINT "core_allocation_amount_not_zero" CHECK ("core_allocation"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "core_posting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"entry_kind" text NOT NULL,
	"account" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_posting_account_known" CHECK ("core_posting"."account" in ('receivable', 'revenue', 'vat_output', 'bank', 'cost_materials', 'cost_labour', 'inventory', 'cost_payable')),
	CONSTRAINT "core_posting_source_known" CHECK ("core_posting"."source_kind" in ('invoice', 'invoice_payment', 'stock_count')),
	CONSTRAINT "core_posting_currency_supported" CHECK ("core_posting"."currency" in ('ZAR')),
	CONSTRAINT "core_posting_entry_kind_present" CHECK (length(btrim("core_posting"."entry_kind")) > 0),
	CONSTRAINT "core_posting_amount_exact" CHECK (abs("core_posting"."amount_cents") <= 9007199254740991),
	CONSTRAINT "core_posting_amount_not_zero" CHECK ("core_posting"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "invoicing_invoice" (
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
	"issue_date" date,
	"due_date" date,
	"source_quote_id" uuid,
	"source_quote_number" text,
	"pricing_mode" text DEFAULT 'exclusive' NOT NULL,
	"tax_engine" text DEFAULT 'za_vat' NOT NULL,
	"vat_rate_ppm" bigint DEFAULT 150000 NOT NULL,
	"vat_policy" text NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"snapshot_subtotal_cents" bigint,
	"snapshot_tax_cents" bigint,
	"snapshot_total_cents" bigint,
	"snapshot_at" timestamp with time zone,
	"share_token_hash" text,
	"share_token_issued_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_reminded_at" timestamp with time zone,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_on" date,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoicing_invoice_id_currency" UNIQUE("id","currency"),
	CONSTRAINT "invoicing_invoice_number_unique" UNIQUE("business_id","number_formatted"),
	CONSTRAINT "invoicing_invoice_share_token_unique" UNIQUE("share_token_hash"),
	CONSTRAINT "invoicing_invoice_status_known" CHECK ("invoicing_invoice"."status" in ('draft', 'sent', 'viewed', 'paid', 'cancelled')),
	CONSTRAINT "invoicing_invoice_pricing_mode_known" CHECK ("invoicing_invoice"."pricing_mode" in ('exclusive', 'inclusive')),
	CONSTRAINT "invoicing_invoice_tax_engine_known" CHECK ("invoicing_invoice"."tax_engine" in ('za_vat', 'none')),
	CONSTRAINT "invoicing_invoice_currency_supported" CHECK ("invoicing_invoice"."currency" in ('ZAR')),
	CONSTRAINT "invoicing_invoice_customer_required_once_issued" CHECK ("invoicing_invoice"."status" = 'draft' or "invoicing_invoice"."customer_id" is not null),
	CONSTRAINT "invoicing_invoice_dates_required_once_issued" CHECK ("invoicing_invoice"."status" = 'draft' or ("invoicing_invoice"."issue_date" is not null and "invoicing_invoice"."due_date" is not null)),
	CONSTRAINT "invoicing_invoice_due_after_issue" CHECK ("invoicing_invoice"."issue_date" is null or "invoicing_invoice"."due_date" is null or "invoicing_invoice"."due_date" >= "invoicing_invoice"."issue_date"),
	CONSTRAINT "invoicing_invoice_number_complete" CHECK (("invoicing_invoice"."number_prefix" is null and "invoicing_invoice"."number_value" is null and "invoicing_invoice"."number_formatted" is null)
			 or ("invoicing_invoice"."number_prefix" is not null and "invoicing_invoice"."number_value" is not null and "invoicing_invoice"."number_formatted" is not null)),
	CONSTRAINT "invoicing_invoice_number_required_once_issued" CHECK ("invoicing_invoice"."status" = 'draft' or "invoicing_invoice"."number_formatted" is not null),
	CONSTRAINT "invoicing_invoice_share_token_complete" CHECK (("invoicing_invoice"."share_token_hash" is null and "invoicing_invoice"."share_token_issued_at" is null)
			 or ("invoicing_invoice"."share_token_hash" is not null and "invoicing_invoice"."share_token_issued_at" is not null)),
	CONSTRAINT "invoicing_invoice_view_count_not_negative" CHECK ("invoicing_invoice"."view_count" >= 0),
	CONSTRAINT "invoicing_invoice_reminder_count_not_negative" CHECK ("invoicing_invoice"."reminder_count" >= 0),
	CONSTRAINT "invoicing_invoice_paid_has_date" CHECK (("invoicing_invoice"."status" = 'paid') = ("invoicing_invoice"."paid_at" is not null)),
	CONSTRAINT "invoicing_invoice_cancelled_has_date" CHECK (("invoicing_invoice"."status" = 'cancelled') = ("invoicing_invoice"."cancelled_at" is not null)),
	CONSTRAINT "invoicing_invoice_issued_has_date" CHECK ("invoicing_invoice"."status" = 'draft' or "invoicing_invoice"."issued_at" is not null),
	CONSTRAINT "invoicing_invoice_vat_rate_exact" CHECK (abs("invoicing_invoice"."vat_rate_ppm") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_snapshot_subtotal_exact" CHECK (abs("invoicing_invoice"."snapshot_subtotal_cents") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_snapshot_tax_exact" CHECK (abs("invoicing_invoice"."snapshot_tax_cents") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_snapshot_total_exact" CHECK (abs("invoicing_invoice"."snapshot_total_cents") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_snapshot_complete" CHECK (("invoicing_invoice"."snapshot_subtotal_cents" is null and "invoicing_invoice"."snapshot_tax_cents" is null
			     and "invoicing_invoice"."snapshot_total_cents" is null and "invoicing_invoice"."snapshot_at" is null)
			 or ("invoicing_invoice"."snapshot_subtotal_cents" is not null and "invoicing_invoice"."snapshot_tax_cents" is not null
			     and "invoicing_invoice"."snapshot_total_cents" is not null and "invoicing_invoice"."snapshot_at" is not null)),
	CONSTRAINT "invoicing_invoice_snapshot_reconciles" CHECK ("invoicing_invoice"."snapshot_total_cents" is null
			 or "invoicing_invoice"."snapshot_subtotal_cents" + "invoicing_invoice"."snapshot_tax_cents" = "invoicing_invoice"."snapshot_total_cents"),
	CONSTRAINT "invoicing_invoice_snapshot_required_once_issued" CHECK ("invoicing_invoice"."status" = 'draft' or "invoicing_invoice"."snapshot_total_cents" is not null),
	CONSTRAINT "invoicing_invoice_vat_policy_present" CHECK (length(btrim("invoicing_invoice"."vat_policy")) > 0)
);
--> statement-breakpoint
CREATE TABLE "invoicing_invoice_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" text,
	"detail" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoicing_invoice_event_kind_known" CHECK ("invoicing_invoice_event"."kind" in ('created', 'issued', 'emailed', 'opened', 'reminded', 'paid', 'part_paid', 'payment_reversed', 'cancelled')),
	CONSTRAINT "invoicing_invoice_event_actor_known" CHECK ("invoicing_invoice_event"."actor" in ('business', 'client', 'system'))
);
--> statement-breakpoint
CREATE TABLE "invoicing_invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"provenance" text,
	"document_description" text,
	"qty_e6" bigint NOT NULL,
	"unit_price_micros" bigint NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"tax_treatment" text DEFAULT 'standard' NOT NULL,
	"vat_rate_ppm" bigint DEFAULT 150000 NOT NULL,
	"no_charge" boolean DEFAULT false NOT NULL,
	"source_item_id" uuid,
	"source_captured_at" timestamp with time zone,
	"cost_micros" bigint,
	"cost_source" text,
	"cost_captured_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoicing_invoice_line_description_present" CHECK (length(btrim("invoicing_invoice_line"."description")) > 0),
	CONSTRAINT "invoicing_invoice_line_tax_treatment_known" CHECK ("invoicing_invoice_line"."tax_treatment" in ('standard', 'zero_rated', 'exempt', 'no_vat')),
	CONSTRAINT "invoicing_invoice_line_currency_supported" CHECK ("invoicing_invoice_line"."currency" in ('ZAR')),
	CONSTRAINT "invoicing_invoice_line_cost_source_known" CHECK ("invoicing_invoice_line"."cost_source" in ('inventory', 'manual')),
	CONSTRAINT "invoicing_invoice_line_qty_exact" CHECK (abs("invoicing_invoice_line"."qty_e6") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_line_unit_price_exact" CHECK (abs("invoicing_invoice_line"."unit_price_micros") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_line_vat_rate_exact" CHECK (abs("invoicing_invoice_line"."vat_rate_ppm") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_line_cost_exact" CHECK (abs("invoicing_invoice_line"."cost_micros") <= 9007199254740991),
	CONSTRAINT "invoicing_invoice_line_qty_not_negative" CHECK ("invoicing_invoice_line"."qty_e6" >= 0),
	CONSTRAINT "invoicing_invoice_line_cost_not_negative" CHECK ("invoicing_invoice_line"."cost_micros" is null or "invoicing_invoice_line"."cost_micros" >= 0),
	CONSTRAINT "invoicing_invoice_line_no_charge_is_zero" CHECK ("invoicing_invoice_line"."no_charge" = false or "invoicing_invoice_line"."unit_price_micros" = 0),
	CONSTRAINT "invoicing_invoice_line_cost_complete" CHECK (("invoicing_invoice_line"."cost_micros" is null and "invoicing_invoice_line"."cost_source" is null and "invoicing_invoice_line"."cost_captured_at" is null)
			 or ("invoicing_invoice_line"."cost_micros" is not null and "invoicing_invoice_line"."cost_source" is not null and "invoicing_invoice_line"."cost_captured_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "invoicing_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text DEFAULT 'payment' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"method" text DEFAULT 'eft' NOT NULL,
	"reference" text,
	"received_on" date NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" text,
	"reverses_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoicing_payment_one_reversal_per_payment" UNIQUE("reverses_payment_id"),
	CONSTRAINT "invoicing_payment_kind_known" CHECK ("invoicing_payment"."kind" in ('payment', 'reversal')),
	CONSTRAINT "invoicing_payment_method_known" CHECK ("invoicing_payment"."method" in ('eft', 'cash', 'card', 'debit_order', 'other')),
	CONSTRAINT "invoicing_payment_currency_supported" CHECK ("invoicing_payment"."currency" in ('ZAR')),
	CONSTRAINT "invoicing_payment_amount_exact" CHECK (abs("invoicing_payment"."amount_cents") <= 9007199254740991),
	CONSTRAINT "invoicing_payment_amount_positive" CHECK ("invoicing_payment"."amount_cents" > 0),
	CONSTRAINT "invoicing_payment_reversal_shape" CHECK (("invoicing_payment"."kind" = 'reversal' and "invoicing_payment"."reverses_payment_id" is not null)
			 or ("invoicing_payment"."kind" = 'payment' and "invoicing_payment"."reverses_payment_id" is null))
);
--> statement-breakpoint
CREATE TABLE "invoicing_setting" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"payment_terms_days" integer DEFAULT 14 NOT NULL,
	"banking_details" text,
	"footer_terms" text,
	"reminder_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoicing_setting_terms_sane" CHECK ("invoicing_setting"."payment_terms_days" between 0 and 365)
);
--> statement-breakpoint
ALTER TABLE "core_allocation" ADD CONSTRAINT "core_allocation_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_allocation" ADD CONSTRAINT "core_allocation_posting_id_core_posting_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."core_posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_posting" ADD CONSTRAINT "core_posting_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice" ADD CONSTRAINT "invoicing_invoice_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice" ADD CONSTRAINT "invoicing_invoice_customer_id_core_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."core_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_event" ADD CONSTRAINT "invoicing_invoice_event_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_event" ADD CONSTRAINT "invoicing_invoice_event_invoice_id_invoicing_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoicing_invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_line" ADD CONSTRAINT "invoicing_invoice_line_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_payment" ADD CONSTRAINT "invoicing_payment_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_setting" ADD CONSTRAINT "invoicing_setting_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_allocation_document_idx" ON "core_allocation" USING btree ("business_id","document_kind","document_id");--> statement-breakpoint
CREATE INDEX "core_allocation_posting_idx" ON "core_allocation" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "core_posting_entry_idx" ON "core_posting" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "core_posting_source_idx" ON "core_posting" USING btree ("business_id","source_kind","source_id");--> statement-breakpoint
CREATE INDEX "core_posting_account_idx" ON "core_posting" USING btree ("business_id","account","occurred_on");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_business_status_idx" ON "invoicing_invoice" USING btree ("business_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_business_updated_idx" ON "invoicing_invoice" USING btree ("business_id","updated_at");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_customer_idx" ON "invoicing_invoice" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_source_quote_idx" ON "invoicing_invoice" USING btree ("business_id","source_quote_id");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_event_invoice_idx" ON "invoicing_invoice_event" USING btree ("invoice_id","occurred_at");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_line_invoice_idx" ON "invoicing_invoice_line" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoicing_payment_invoice_idx" ON "invoicing_payment" USING btree ("invoice_id","received_on");
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT drizzle-kit CANNOT SEE
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Row Level Security, the `updated_at` and audit triggers, two COMPOSITE foreign keys, the
-- share policies for the client's copy, and — the reason this file is long — the four rules
-- that make an invoice a tax record rather than an editable document. None of it has a Drizzle
-- representation, so `generate` produced the tables above and none of what makes them safe.
--
-- Hand-written here in the same shape as `0005_quoting.sql`, and asserted independently by
-- `scripts/invariants.sql`.
--
-- Grants are already covered: `ALTER DEFAULT PRIVILEGES` in 0003 gives the application role
-- SELECT/INSERT/UPDATE on every future table in `public`, and no DELETE. Which is exactly right
-- here: a discarded draft is archived, a payment is reversed by a row, and an issued invoice is
-- never unissued.

-- ── The composite foreign keys ───────────────────────────────────────────────────────
--
-- `(invoice_id, currency) -> invoicing_invoice (id, currency)` rather than `invoice_id -> id`,
-- on both the lines and the payments.
--
-- `core/money/types.ts` names this as the thing that makes a mixed-currency document a database
-- error rather than a silently wrong total. On a payment it is the same guarantee one step
-- further out: a receipt in another currency cannot be applied to this invoice at all, which is
-- the case where "silently wrong" would mean an invoice marked paid by money that never covered
-- it.

ALTER TABLE "invoicing_invoice_line"
	ADD CONSTRAINT "invoicing_invoice_line_invoice_fk"
	FOREIGN KEY ("invoice_id", "currency")
	REFERENCES "public"."invoicing_invoice"("id", "currency")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "invoicing_payment"
	ADD CONSTRAINT "invoicing_payment_invoice_fk"
	FOREIGN KEY ("invoice_id", "currency")
	REFERENCES "public"."invoicing_invoice"("id", "currency")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- A reversal points at a payment on the same table. Self-referential, so drizzle-kit leaves it
-- out; without it a reversal could name a payment that does not exist.
ALTER TABLE "invoicing_payment"
	ADD CONSTRAINT "invoicing_payment_reverses_fk"
	FOREIGN KEY ("reverses_payment_id")
	REFERENCES "public"."invoicing_payment"("id")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- ── Row Level Security ───────────────────────────────────────────────────────────────
--
-- ENABLE and FORCE, and the identical one-expression policy every other table carries. Six
-- tables: four for Invoicing, two for the ledger.

ALTER TABLE "invoicing_invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_invoice" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_payment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_setting" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoicing_setting" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_posting" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_posting" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_allocation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core_allocation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "invoicing_invoice"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoicing_invoice_line"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoicing_invoice_event"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoicing_payment"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoicing_setting"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core_posting"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core_allocation"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint

-- ── updated_at ───────────────────────────────────────────────────────────────────────

CREATE TRIGGER "invoicing_invoice_touch" BEFORE UPDATE ON "invoicing_invoice"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "invoicing_invoice_line_touch" BEFORE UPDATE ON "invoicing_invoice_line"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "invoicing_invoice_event_touch" BEFORE UPDATE ON "invoicing_invoice_event"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "invoicing_payment_touch" BEFORE UPDATE ON "invoicing_payment"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "invoicing_setting_touch" BEFORE UPDATE ON "invoicing_setting"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "core_posting_touch" BEFORE UPDATE ON "core_posting"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "core_allocation_touch" BEFORE UPDATE ON "core_allocation"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint

-- ── Audit ────────────────────────────────────────────────────────────────────────────
--
-- Everything. An invoice is the document a business may have to defend years later, and the
-- row-change log is the only record of it the application cannot rewrite (audit holds INSERT
-- and SELECT, nothing else — see 0003).

CREATE TRIGGER "invoicing_invoice_audit" AFTER INSERT OR UPDATE OR DELETE ON "invoicing_invoice"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "invoicing_invoice_line_audit" AFTER INSERT OR UPDATE OR DELETE ON "invoicing_invoice_line"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "invoicing_invoice_event_audit" AFTER INSERT OR UPDATE OR DELETE ON "invoicing_invoice_event"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "invoicing_payment_audit" AFTER INSERT OR UPDATE OR DELETE ON "invoicing_payment"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "invoicing_setting_audit" AFTER INSERT OR UPDATE OR DELETE ON "invoicing_setting"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('business_id');
--> statement-breakpoint
CREATE TRIGGER "core_posting_audit" AFTER INSERT OR UPDATE OR DELETE ON "core_posting"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "core_allocation_audit" AFTER INSERT OR UPDATE OR DELETE ON "core_allocation"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- AN ISSUED INVOICE IS FROZEN
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- T19, in its own words: "A sent invoice cannot be edited; the attempt fails at the database,
-- not just the UI."
--
-- A CHECK constraint cannot express this, because the rule is about the DIFFERENCE between two
-- versions of a row rather than about either one of them. So it is a trigger, and it is written
-- as an ALLOW-LIST: everything on an issued invoice is immutable except the handful of columns
-- that record what happened to it AFTER it was issued.
--
-- An allow-list rather than a deny-list on purpose. A column added in a later migration is then
-- frozen by default, and somebody has to think about it to make it mutable — which is the safe
-- direction for a table holding tax records. A deny-list would silently leave every new column
-- editable on documents a client already holds.
--
-- WHAT REMAINS MUTABLE, AND WHY EACH ONE IS SAFE
--   status              the transitions below, and no others
--   paid_at/paid_on     when it settled; set and cleared by settlement
--   cancelled_at/reason cancellation, which is one-way
--   view tracking       the client opening their copy; nothing on the document
--   reminder tracking   the business chasing it; nothing on the document
--   send_to_*           WHERE to email it. Not printed on the sheet, and a business that typed
--                       the address wrong must still be able to reach its client.
--   share token         reissued if a link has to be replaced; opens the same document.
--   updated_at          the trigger above sets it.
--
-- Note what is NOT here: `archived_at`. A draft can be discarded; an issued invoice cannot be
-- tidied away, because it is a tax record. Cancellation is the only exit it has.

CREATE OR REPLACE FUNCTION "app".freeze_issued_invoice() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	v_frozen text[] := ARRAY[
		'customer_id', 'customer_name', 'customer_contact_person', 'customer_email',
		'customer_phone', 'customer_vat_number', 'customer_address_line1',
		'customer_address_line2', 'customer_city', 'customer_postal_code', 'customer_country',
		'number_prefix', 'number_value', 'number_formatted',
		'issue_date', 'due_date',
		'pricing_mode', 'tax_engine', 'vat_rate_ppm', 'vat_policy', 'currency',
		'snapshot_subtotal_cents', 'snapshot_tax_cents', 'snapshot_total_cents', 'snapshot_at',
		'source_quote_id', 'source_quote_number', 'issued_at', 'archived_at',
		'business_id', 'id', 'created_at'
	];
	v_before jsonb := to_jsonb(OLD);
	v_after  jsonb := to_jsonb(NEW);
	v_column text;
BEGIN
	-- A draft is ordinary. Everything below is about what happens once a client has a copy.
	-- The issuing UPDATE itself passes here for free, because it reads OLD.status = 'draft' —
	-- which is exactly right: the document is being created at that moment, not altered.
	IF OLD.status = 'draft' THEN
		RETURN NEW;
	END IF;

	FOREACH v_column IN ARRAY v_frozen LOOP
		IF (v_before -> v_column) IS DISTINCT FROM (v_after -> v_column) THEN
			RAISE EXCEPTION
				'invoice % has been issued, so "%" cannot be changed. Corrections to an issued invoice are made with a credit note.',
				coalesce(OLD.number_formatted, OLD.id::text), v_column
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;
	END LOOP;

	-- ── The status transitions an issued invoice may make ────────────────────────────
	--
	--   sent   <-> viewed    the client opened it (and a reversal may send it back)
	--   sent/viewed -> paid  it settled
	--   paid   -> sent/viewed a payment was reversed within its window
	--   any    -> cancelled  withdrawn, once and forever (see refuse_uncancel below)
	--
	-- Anything else — `paid` back to `draft`, a cancelled invoice reopening — is a document
	-- changing its meaning after a client has read it.
	IF NEW.status IS DISTINCT FROM OLD.status THEN
		IF OLD.status = 'cancelled' THEN
			RAISE EXCEPTION
				'invoice % has been cancelled, and a cancellation cannot be undone. Issue a new invoice instead.',
				coalesce(OLD.number_formatted, OLD.id::text)
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;

		IF NEW.status = 'draft' THEN
			RAISE EXCEPTION
				'invoice % has been issued and cannot go back to being a draft.',
				coalesce(OLD.number_formatted, OLD.id::text)
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;

		-- Cancelling an invoice that has been paid would leave received money allocated to a
		-- withdrawn document. A credit note is the instrument for that, and it is a separate
		-- document with its own number — which is why `credit_note` has had a sequence reserved
		-- in `core_document_number` since M2.
		IF NEW.status = 'cancelled' AND EXISTS (
			SELECT 1
			  FROM invoicing_payment p
			 WHERE p.invoice_id = OLD.id
			   AND p.kind = 'payment'
			   AND NOT EXISTS (
			       SELECT 1 FROM invoicing_payment r
			        WHERE r.reverses_payment_id = p.id
			   )
		) THEN
			RAISE EXCEPTION
				'invoice % has money recorded against it, so it cannot be cancelled. Reverse the payment first, or issue a credit note.',
				coalesce(OLD.number_formatted, OLD.id::text)
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;
	END IF;

	RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER "invoicing_invoice_freeze" BEFORE UPDATE ON "invoicing_invoice"
	FOR EACH ROW EXECUTE FUNCTION "app".freeze_issued_invoice();
--> statement-breakpoint

-- ── The lines of an issued invoice ───────────────────────────────────────────────────
--
-- The header being frozen is worth nothing if the lines under it can move: the totals are a
-- snapshot, so an edited line would leave a document whose printed total no longer matches the
-- rows it was calculated from — and `priceDocument` recomputes from the rows.
--
-- BEFORE INSERT as well as UPDATE. Adding a line to an issued invoice is the same defect as
-- editing one, and it is the easier of the two to do by accident.

CREATE OR REPLACE FUNCTION "app".freeze_issued_invoice_line() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	v_status text;
	v_number text;
BEGIN
	SELECT i.status, coalesce(i.number_formatted, i.id::text)
	  INTO v_status, v_number
	  FROM invoicing_invoice i
	 WHERE i.id = NEW.invoice_id;

	-- No parent visible: either it does not exist, or it belongs to another tenant and RLS has
	-- hidden it. The composite foreign key will refuse the row either way; this trigger has
	-- nothing to add and must not turn a clear constraint failure into a confusing one.
	IF v_status IS NULL OR v_status = 'draft' THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION
		'invoice % has been issued, so its lines cannot be changed. Corrections to an issued invoice are made with a credit note.',
		v_number
		USING ERRCODE = 'integrity_constraint_violation';
END $$;
--> statement-breakpoint

CREATE TRIGGER "invoicing_invoice_line_freeze" BEFORE INSERT OR UPDATE ON "invoicing_invoice_line"
	FOR EACH ROW EXECUTE FUNCTION "app".freeze_issued_invoice_line();
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A PAYMENT IS TAKEN BACK BY A ROW, WITHIN THIRTY DAYS
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- The design states the window on the screen, before the action rather than in a dialog after
-- it: "Recording a payment can be undone for 30 days. Cancelling an invoice can't — we'll ask
-- you to confirm."
--
-- Thirty days from when the payment was RECORDED, not from the day the money moved: the promise
-- is about the act of recording, and a payment entered late for an old bank date would otherwise
-- arrive already un-undoable.
--
-- The number appears twice — here and as `REVERSAL_WINDOW_DAYS` in `$lib/core/invoicing/types.ts`,
-- which is what the screen's sentence and the service check both read. `invoicing.test.ts`
-- asserts the database refuses on day 31, so the two cannot drift apart unnoticed.
--
-- A payment is also immutable: correcting one is reversing it and recording another. Without
-- that, the reversal window could be dodged by editing the amount.

CREATE OR REPLACE FUNCTION "app".enforce_payment_rules() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	v_original invoicing_payment%ROWTYPE;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		RAISE EXCEPTION
			'a recorded payment cannot be edited. Undo it and record the correct one — the history of what was recorded is part of the invoice.'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;

	IF NEW.kind <> 'reversal' THEN
		RETURN NEW;
	END IF;

	SELECT * INTO v_original FROM invoicing_payment WHERE id = NEW.reverses_payment_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'the payment being undone does not exist.'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;

	IF v_original.kind <> 'payment' THEN
		RAISE EXCEPTION 'that is already an undo, and cannot itself be undone.'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;

	-- A reversal that named a different invoice or a different amount would not be an undo, it
	-- would be a second transaction wearing the word.
	IF v_original.invoice_id <> NEW.invoice_id OR v_original.amount_cents <> NEW.amount_cents THEN
		RAISE EXCEPTION
			'an undo must exactly reverse the payment it names — same invoice, same amount.'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;

	IF v_original.recorded_at < now() - interval '30 days' THEN
		RAISE EXCEPTION
			'that payment was recorded more than 30 days ago, so it can no longer be undone. Record a credit note instead.'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;

	RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER "invoicing_payment_rules" BEFORE INSERT OR UPDATE ON "invoicing_payment"
	FOR EACH ROW EXECUTE FUNCTION "app".enforce_payment_rules();
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- THE BOOKS BALANCE, OR NOTHING COMMITS
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Every entry's legs sum to zero. A DEFERRED constraint trigger, because the legs are inserted
-- one statement at a time and an entry is unbalanced in the middle of being written — the check
-- belongs at COMMIT, which is the first moment the entry is meant to be whole.
--
-- This is what makes "the margin figures reconcile to ledger postings" a claim with something
-- behind it. A half-written entry cannot commit: not from a bug, not from a crash between two
-- inserts, not from a future module that posts carelessly.

CREATE OR REPLACE FUNCTION "app".assert_entry_balances() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	v_sum bigint;
BEGIN
	SELECT sum(amount_cents) INTO v_sum
	  FROM core_posting WHERE entry_id = NEW.entry_id;

	IF v_sum <> 0 THEN
		RAISE EXCEPTION
			'ledger entry % does not balance: its legs sum to % rather than 0.', NEW.entry_id, v_sum
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;

	RETURN NULL;
END $$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "core_posting_balances"
	AFTER INSERT OR UPDATE ON "core_posting"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "app".assert_entry_balances();
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- THE CLIENT'S COPY
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- T21's timeline has a line the product cannot write without this: "Opened by Baraka Café ·
-- Twice · last 26 Jul, 08:41". A PDF attachment cannot report that it was read, so an invoice
-- is emailed as a LINK as well — and the person following it has no account, no session and no
-- membership, exactly like the client answering a quote.
--
-- The arrangement is `0006_quote_sharing.sql`'s, reused rather than reinvented:
-- `runWithShareToken` sets `cjs.share_token` and nothing else, and the policies below admit
-- precisely one invoice, its lines, its customer and its business. Every other table, and every
-- other row of those four, still evaluates `business_id = NULL` and returns nothing.
--
-- `app.current_share_token()` already exists from 0006. The two customer/business policies are
-- named `invoice_share` rather than `document_share` because a policy name is unique per table
-- and the quote one is already there — and because multiple permissive policies OR together,
-- which is exactly the semantics wanted: a token opens a quote or an invoice, never both.
--
-- SELECT ONLY, all four. Recording that a client opened their invoice is a WRITE and goes
-- through `tenant_isolation`, as `accept.ts` does for quotes: the tenant is resolved from the
-- token and one bounded update runs as that tenant, with no user attached — because there
-- genuinely is not one.
--
-- WHAT A CLIENT DELIBERATELY CANNOT SEE: `invoicing_payment` and `core_posting`. What the
-- business was paid by other clients, and what the job cost them, are not on the document and
-- are none of this reader's business. The absence of a policy is what enforces that.

CREATE POLICY "document_share" ON "invoicing_invoice"
	FOR SELECT
	USING (
		"share_token_hash" IS NOT NULL
		AND "app".current_share_token() IS NOT NULL
		AND "share_token_hash" = "app".current_share_token()
	);
--> statement-breakpoint

CREATE POLICY "document_share" ON "invoicing_invoice_line"
	FOR SELECT
	USING (
		"invoice_id" IN (
			SELECT "i"."id" FROM "invoicing_invoice" "i"
			 WHERE "i"."share_token_hash" IS NOT NULL
			   AND "app".current_share_token() IS NOT NULL
			   AND "i"."share_token_hash" = "app".current_share_token()
		)
	);
--> statement-breakpoint

CREATE POLICY "invoice_share" ON "core_customer"
	FOR SELECT
	USING (
		"id" IN (
			SELECT "i"."customer_id" FROM "invoicing_invoice" "i"
			 WHERE "i"."share_token_hash" IS NOT NULL
			   AND "app".current_share_token() IS NOT NULL
			   AND "i"."share_token_hash" = "app".current_share_token()
		)
	);
--> statement-breakpoint

-- The masthead and the banking details: trading name, address, VAT number, phone. All of it is
-- already on the PDF in the client's inbox, which is the test for whether a public page may show
-- it — and an invoice without bank details is one nobody can pay.
CREATE POLICY "invoice_share" ON "core_business"
	FOR SELECT
	USING (
		"business_id" IN (
			SELECT "i"."business_id" FROM "invoicing_invoice" "i"
			 WHERE "i"."share_token_hash" IS NOT NULL
			   AND "app".current_share_token() IS NOT NULL
			   AND "i"."share_token_hash" = "app".current_share_token()
		)
	);
--> statement-breakpoint

CREATE POLICY "invoice_share" ON "invoicing_setting"
	FOR SELECT
	USING (
		"business_id" IN (
			SELECT "i"."business_id" FROM "invoicing_invoice" "i"
			 WHERE "i"."share_token_hash" IS NOT NULL
			   AND "app".current_share_token() IS NOT NULL
			   AND "i"."share_token_hash" = "app".current_share_token()
		)
	);
