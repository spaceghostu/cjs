CREATE TABLE "core_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"number_prefix" text NOT NULL,
	"number_value" integer NOT NULL,
	"number_formatted" text NOT NULL,
	"service" text,
	"area" text,
	"description" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'unscheduled' NOT NULL,
	"started_by_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_job_business_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "core_job_number_unique" UNIQUE("business_id","number_formatted"),
	CONSTRAINT "core_job_status_known" CHECK ("core_job"."status" in ('unscheduled', 'scheduled', 'in_progress', 'done', 'on_hold', 'cancelled')),
	CONSTRAINT "core_job_priority_known" CHECK ("core_job"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "core_job_number_prefix_present" CHECK (length(btrim("core_job"."number_prefix")) > 0)
);
--> statement-breakpoint
ALTER TABLE "core_document_number" DROP CONSTRAINT "core_document_number_type_known";--> statement-breakpoint
ALTER TABLE "quoting_quote" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "invoicing_invoice" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "core_job" ADD CONSTRAINT "core_job_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_job" ADD CONSTRAINT "core_job_customer_id_core_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."core_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_job_business_status_idx" ON "core_job" USING btree ("business_id","status","created_at");--> statement-breakpoint
CREATE INDEX "core_job_customer_idx" ON "core_job" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "quoting_quote_job_idx" ON "quoting_quote" USING btree ("business_id","job_id");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_job_idx" ON "invoicing_invoice" USING btree ("business_id","job_id");--> statement-breakpoint
ALTER TABLE "core_document_number" ADD CONSTRAINT "core_document_number_type_known" CHECK ("core_document_number"."doc_type" in ('quote', 'invoice', 'credit_note', 'stock_count', 'job'));