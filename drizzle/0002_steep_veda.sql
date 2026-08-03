CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TYPE "public"."core_member_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TABLE "core_business" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"trading_name" text NOT NULL,
	"legal_name" text,
	"registration_number" text,
	"vat_number" text,
	"phone" text,
	"email" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postal_code" text,
	"country" text DEFAULT 'ZA' NOT NULL,
	"brand_color" text DEFAULT '#5464EE' NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"locale" text DEFAULT 'en-ZA' NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_business_trading_name_present" CHECK (length(btrim("core_business"."trading_name")) > 0),
	CONSTRAINT "core_business_brand_color_known" CHECK ("core_business"."brand_color" in ('#5464EE', '#277E94', '#8660BF', '#2A835B')),
	CONSTRAINT "core_business_currency_supported" CHECK ("core_business"."currency" in ('ZAR'))
);
--> statement-breakpoint
CREATE TABLE "core_customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"vat_number" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postal_code" text,
	"country" text DEFAULT 'ZA' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_customer_name_present" CHECK (length(btrim("core_customer"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "core_document_number" (
	"business_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"prefix" text NOT NULL,
	"pad" integer DEFAULT 4 NOT NULL,
	"next_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_document_number_business_id_doc_type_pk" PRIMARY KEY("business_id","doc_type"),
	CONSTRAINT "core_document_number_type_known" CHECK ("core_document_number"."doc_type" in ('quote', 'invoice', 'credit_note', 'stock_count')),
	CONSTRAINT "core_document_number_prefix_present" CHECK (length(btrim("core_document_number"."prefix")) > 0),
	CONSTRAINT "core_document_number_next_positive" CHECK ("core_document_number"."next_value" > 0),
	CONSTRAINT "core_document_number_pad_sane" CHECK ("core_document_number"."pad" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "core_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "core_member_role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_member_one_per_user_per_business" UNIQUE("business_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "audit"."row_change" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit"."row_change_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_user_id" text,
	"table_name" text NOT NULL,
	"op" text NOT NULL,
	"row_id" text,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
ALTER TABLE "core_customer" ADD CONSTRAINT "core_customer_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_document_number" ADD CONSTRAINT "core_document_number_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_member" ADD CONSTRAINT "core_member_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_member" ADD CONSTRAINT "core_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_customer_business_name_idx" ON "core_customer" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "core_member_user_idx" ON "core_member" USING btree ("user_id");