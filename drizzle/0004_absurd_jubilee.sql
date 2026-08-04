CREATE TABLE "billing_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"price_cents" bigint NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscription_module_known" CHECK ("billing_subscription"."module_key" in ('quoting', 'invoicing', 'bookings', 'inventory', 'scheduling', 'payroll', 'expenses')),
	CONSTRAINT "billing_subscription_currency_supported" CHECK ("billing_subscription"."currency" in ('ZAR')),
	CONSTRAINT "billing_subscription_price_exact" CHECK (abs("billing_subscription"."price_cents") <= 9007199254740991),
	CONSTRAINT "billing_subscription_price_not_negative" CHECK ("billing_subscription"."price_cents" >= 0),
	CONSTRAINT "billing_subscription_period_ordered" CHECK ("billing_subscription"."ended_at" is null or "billing_subscription"."ended_at" >= "billing_subscription"."started_at")
);
--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscription_one_open_per_module" ON "billing_subscription" USING btree ("business_id","module_key") WHERE ended_at is null and voided_at is null;--> statement-breakpoint
CREATE INDEX "billing_subscription_business_idx" ON "billing_subscription" USING btree ("business_id","module_key","started_at");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT drizzle-kit CANNOT SEE
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Row Level Security, the `updated_at` trigger and the audit trigger have no Drizzle
-- representation, so `generate` produced the table above and none of what makes it a TENANT
-- table. Hand-written here, in the same shape as `0003_platform.sql`, and asserted
-- independently by `scripts/invariants.sql` — a table that reached production without these
-- would be visible to every business at once.
--
-- The grants are already covered: `ALTER DEFAULT PRIVILEGES` in 0003 gives the application
-- role SELECT/INSERT/UPDATE on every future table in `public`, and no DELETE. Which is
-- exactly right here — a subscription period is closed or voided, never removed.

ALTER TABLE "billing_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_subscription" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "billing_subscription"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint

CREATE TRIGGER "billing_subscription_touch" BEFORE UPDATE ON "billing_subscription"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint

-- Audited, and of everything in the floor this is the table where it matters most: it is
-- the record of what a business was charged for and when. "You were only charged for the
-- days you had it" is a claim someone may one day have to defend with evidence.
CREATE TRIGGER "billing_subscription_audit" AFTER INSERT OR UPDATE OR DELETE ON "billing_subscription"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
