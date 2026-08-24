CREATE TABLE "inventory_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"description" text,
	"unit" text DEFAULT 'each' NOT NULL,
	"cost_micros" bigint,
	"sell_micros" bigint,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"reorder_point_e6" bigint DEFAULT 0 NOT NULL,
	"default_location_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_item_id_currency" UNIQUE("id","currency"),
	CONSTRAINT "inventory_item_sku_unique" UNIQUE("business_id","sku"),
	CONSTRAINT "inventory_item_name_present" CHECK (length(btrim("inventory_item"."name")) > 0),
	CONSTRAINT "inventory_item_unit_present" CHECK (length(btrim("inventory_item"."unit")) > 0),
	CONSTRAINT "inventory_item_currency_supported" CHECK ("inventory_item"."currency" in ('ZAR')),
	CONSTRAINT "inventory_item_cost_exact" CHECK (abs("inventory_item"."cost_micros") <= 9007199254740991),
	CONSTRAINT "inventory_item_sell_exact" CHECK (abs("inventory_item"."sell_micros") <= 9007199254740991),
	CONSTRAINT "inventory_item_reorder_point_exact" CHECK (abs("inventory_item"."reorder_point_e6") <= 9007199254740991),
	CONSTRAINT "inventory_item_cost_not_negative" CHECK ("inventory_item"."cost_micros" is null or "inventory_item"."cost_micros" >= 0),
	CONSTRAINT "inventory_item_sell_not_negative" CHECK ("inventory_item"."sell_micros" is null or "inventory_item"."sell_micros" >= 0),
	CONSTRAINT "inventory_item_reorder_not_negative" CHECK ("inventory_item"."reorder_point_e6" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_location_name_unique" UNIQUE("business_id","name"),
	CONSTRAINT "inventory_location_name_present" CHECK (length(btrim("inventory_location"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"qty_e6" bigint NOT NULL,
	"reason" text NOT NULL,
	"source_id" uuid,
	"source_ref" text,
	"unit_cost_micros" bigint,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"occurred_on" date NOT NULL,
	"recorded_by_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movement_reason_known" CHECK ("inventory_movement"."reason" in ('opening', 'purchase', 'stock_count', 'quote', 'invoice', 'correction')),
	CONSTRAINT "inventory_movement_currency_supported" CHECK ("inventory_movement"."currency" in ('ZAR')),
	CONSTRAINT "inventory_movement_qty_exact" CHECK (abs("inventory_movement"."qty_e6") <= 9007199254740991),
	CONSTRAINT "inventory_movement_cost_exact" CHECK (abs("inventory_movement"."unit_cost_micros") <= 9007199254740991),
	CONSTRAINT "inventory_movement_qty_not_zero" CHECK ("inventory_movement"."qty_e6" <> 0),
	CONSTRAINT "inventory_movement_cost_not_negative" CHECK ("inventory_movement"."unit_cost_micros" is null or "inventory_movement"."unit_cost_micros" >= 0),
	CONSTRAINT "inventory_movement_source_shape" CHECK ("inventory_movement"."reason" not in ('quote', 'invoice', 'stock_count') or "inventory_movement"."source_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number_prefix" text NOT NULL,
	"number_value" integer NOT NULL,
	"number_formatted" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_by_user_id" text,
	"applied_at" timestamp with time zone,
	"applied_by_user_id" text,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_stock_count_number_unique" UNIQUE("business_id","number_formatted"),
	CONSTRAINT "inventory_stock_count_status_known" CHECK ("inventory_stock_count"."status" in ('preparing', 'counting', 'reviewing', 'applied')),
	CONSTRAINT "inventory_stock_count_prefix_present" CHECK (length(btrim("inventory_stock_count"."number_prefix")) > 0),
	CONSTRAINT "inventory_stock_count_period_ordered" CHECK ("inventory_stock_count"."period_end" >= "inventory_stock_count"."period_start"),
	CONSTRAINT "inventory_stock_count_applied_has_date" CHECK (("inventory_stock_count"."status" = 'applied') = ("inventory_stock_count"."applied_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_count_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"expected_qty_e6" bigint NOT NULL,
	"counted_qty_e6" bigint,
	"counted_at" timestamp with time zone,
	"counted_by_user_id" text,
	"unit_cost_micros" bigint,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"note" text,
	"movement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_stock_count_line_unique" UNIQUE("stock_count_id","item_id","location_id"),
	CONSTRAINT "inventory_stock_count_line_currency_supported" CHECK ("inventory_stock_count_line"."currency" in ('ZAR')),
	CONSTRAINT "inventory_stock_count_line_expected_exact" CHECK (abs("inventory_stock_count_line"."expected_qty_e6") <= 9007199254740991),
	CONSTRAINT "inventory_stock_count_line_counted_exact" CHECK (abs("inventory_stock_count_line"."counted_qty_e6") <= 9007199254740991),
	CONSTRAINT "inventory_stock_count_line_cost_exact" CHECK (abs("inventory_stock_count_line"."unit_cost_micros") <= 9007199254740991),
	CONSTRAINT "inventory_stock_count_line_counted_not_negative" CHECK ("inventory_stock_count_line"."counted_qty_e6" is null or "inventory_stock_count_line"."counted_qty_e6" >= 0),
	CONSTRAINT "inventory_stock_count_line_counted_complete" CHECK (("inventory_stock_count_line"."counted_qty_e6" is null) = ("inventory_stock_count_line"."counted_at" is null)),
	CONSTRAINT "inventory_stock_count_line_cost_not_negative" CHECK ("inventory_stock_count_line"."unit_cost_micros" is null or "inventory_stock_count_line"."unit_cost_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_default_location_id_inventory_location_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location" ADD CONSTRAINT "inventory_location_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_count" ADD CONSTRAINT "inventory_stock_count_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_count_line" ADD CONSTRAINT "inventory_stock_count_line_business_id_core_business_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."core_business"("business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_count_line" ADD CONSTRAINT "inventory_stock_count_line_stock_count_id_inventory_stock_count_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."inventory_stock_count"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_count_line" ADD CONSTRAINT "inventory_stock_count_line_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_count_line" ADD CONSTRAINT "inventory_stock_count_line_movement_id_inventory_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_item_business_name_idx" ON "inventory_item" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "inventory_item_business_location_idx" ON "inventory_item" USING btree ("business_id","default_location_id");--> statement-breakpoint
CREATE INDEX "inventory_location_business_name_idx" ON "inventory_location" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "inventory_movement_level_idx" ON "inventory_movement" USING btree ("business_id","item_id","location_id");--> statement-breakpoint
CREATE INDEX "inventory_movement_history_idx" ON "inventory_movement" USING btree ("business_id","item_id","occurred_on","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movement_source_idx" ON "inventory_movement" USING btree ("business_id","reason","source_id");--> statement-breakpoint
CREATE INDEX "inventory_stock_count_business_status_idx" ON "inventory_stock_count" USING btree ("business_id","status","started_at");--> statement-breakpoint
CREATE INDEX "inventory_stock_count_line_count_idx" ON "inventory_stock_count_line" USING btree ("stock_count_id","position");
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT drizzle-kit CANNOT SEE
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Row Level Security, the `updated_at` and audit triggers, two COMPOSITE foreign keys, the
-- derived level view — and the three rules that make a quantity a fact rather than an opinion.
-- None of it has a Drizzle representation, so `generate` produced the tables above and none of
-- what makes them true.
--
-- Hand-written here in the same shape as `0007_invoicing.sql`, and asserted independently by
-- `scripts/invariants.sql` and by `schema/inventory.test.ts`.
--
-- Grants are already covered for the TABLES: `ALTER DEFAULT PRIVILEGES` in 0003 gives the
-- application role SELECT/INSERT/UPDATE on every future table in `public`, and no DELETE. Which
-- is exactly right here: an item is archived, never deleted, and a movement is corrected by a
-- further movement rather than by editing the one that was wrong. The VIEW needs its own
-- treatment — see the bottom of this file.

-- ── The composite foreign keys ───────────────────────────────────────────────────────
--
-- `(item_id, currency) -> inventory_item (id, currency)` rather than `item_id -> id`, on both
-- the movements and the count lines.
--
-- `core/money/types.ts` names this as the thing that makes a mixed-currency document a database
-- error rather than a silently wrong total. Here it means a movement cannot snapshot a cost in a
-- currency the item is not priced in — which is the case where "silently wrong" would mean a
-- stock valuation that adds rand to something that is not rand.

ALTER TABLE "inventory_movement"
	ADD CONSTRAINT "inventory_movement_item_fk"
	FOREIGN KEY ("item_id", "currency")
	REFERENCES "public"."inventory_item"("id", "currency")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "inventory_stock_count_line"
	ADD CONSTRAINT "inventory_stock_count_line_item_fk"
	FOREIGN KEY ("item_id", "currency")
	REFERENCES "public"."inventory_item"("id", "currency")
	ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- ── Row Level Security ───────────────────────────────────────────────────────────────
--
-- ENABLE and FORCE, and the identical one-expression policy every other table carries. ENABLE
-- alone leaves the table's OWNER exempt, and migrations run as the owner.

ALTER TABLE "inventory_location" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_location" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_movement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_movement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_stock_count" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_stock_count" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_stock_count_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_stock_count_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "inventory_location"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory_item"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory_movement"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory_stock_count"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory_stock_count_line"
	USING ("business_id" = "app".current_business_id())
	WITH CHECK ("business_id" = "app".current_business_id());
--> statement-breakpoint

-- ── updated_at ───────────────────────────────────────────────────────────────────────

CREATE TRIGGER "inventory_location_touch" BEFORE UPDATE ON "inventory_location"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "inventory_item_touch" BEFORE UPDATE ON "inventory_item"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "inventory_movement_touch" BEFORE UPDATE ON "inventory_movement"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "inventory_stock_count_touch" BEFORE UPDATE ON "inventory_stock_count"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER "inventory_stock_count_line_touch" BEFORE UPDATE ON "inventory_stock_count_line"
	FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();
--> statement-breakpoint

-- ── Audit ────────────────────────────────────────────────────────────────────────────
--
-- Everything. Stock is what a business owns, and an argument about a quantity months later is
-- settled by the row-change log — the one record the application cannot rewrite (audit holds
-- INSERT and SELECT, nothing else; see 0003).

CREATE TRIGGER "inventory_location_audit" AFTER INSERT OR UPDATE OR DELETE ON "inventory_location"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "inventory_item_audit" AFTER INSERT OR UPDATE OR DELETE ON "inventory_item"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "inventory_movement_audit" AFTER INSERT OR UPDATE OR DELETE ON "inventory_movement"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "inventory_stock_count_audit" AFTER INSERT OR UPDATE OR DELETE ON "inventory_stock_count"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint
CREATE TRIGGER "inventory_stock_count_line_audit" AFTER INSERT OR UPDATE OR DELETE ON "inventory_stock_count_line"
	FOR EACH ROW EXECUTE FUNCTION "app".log_row_change('id');
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A MOVEMENT IS A RECORD OF SOMETHING THAT HAPPENED
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- T23: `inventory_movement` is "append-only. Every change carries a reason."
--
-- DELETE is already impossible — 0003 revokes it from the application role across `public`. That
-- leaves UPDATE, and this refuses it outright. There is no allow-list here, unlike
-- `freeze_issued_invoice`: an invoice goes on having things happen TO it after issue, and a
-- movement does not. It is one line in a ledger about one moment, and that moment does not change.
--
-- The correct way to fix a movement that was wrong is another movement that says so, with reason
-- `correction`. That is what the error message says, because a person meeting this at 2am should
-- be told what to do instead of what they did wrong.
--
-- `updated_at` is exempt, and only `updated_at`: `touch_updated_at` fires BEFORE UPDATE on this
-- table like every other, and without the exemption the two triggers would deadlock the table
-- against itself. In practice nothing reaches here, because no UPDATE gets past the check below.

CREATE OR REPLACE FUNCTION "app".refuse_movement_change() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
BEGIN
	RAISE EXCEPTION
		'stock movement % has already been recorded, so it cannot be changed. Record a correcting movement instead — the history is what makes a quantity provable.',
		OLD.id
		USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "inventory_movement_append_only" BEFORE UPDATE ON "inventory_movement"
	FOR EACH ROW EXECUTE FUNCTION "app".refuse_movement_change();
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- A COUNT COMMITS NOTHING UNTIL IT IS APPLIED, AND NOTHING AFTERWARDS
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Two rules, one on each table, both of them T24's promise made structural:
--
--   > Nothing changes in your stock until you've reviewed it at step 3.
--
--  1. EXPECTED IS SNAPSHOTTED AT PREPARATION. Once a count leaves `preparing`, no line's
--     `expected_qty_e6` may change and no new line may be added. T23 states the reason: stock
--     moving during a count would otherwise silently change what the counter is comparing
--     against, and the person holding the clipboard gets blamed for the difference.
--
--  2. AN APPLIED COUNT IS FROZEN. Applying writes one movement per varying line; re-running it
--     would write them all again, and every quantity in the business would move twice. Written as
--     an ALLOW-LIST for the same reason `freeze_issued_invoice` is — a column added in a later
--     migration is then frozen by default, and somebody has to think about it to make it mutable.

CREATE OR REPLACE FUNCTION "app".freeze_applied_count() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	v_frozen text[] := ARRAY[
		'id', 'business_id', 'created_at',
		'number_prefix', 'number_value', 'number_formatted',
		'period_start', 'period_end',
		'started_at', 'started_by_user_id',
		'applied_at', 'applied_by_user_id'
	];
	v_before jsonb := to_jsonb(OLD);
	v_after  jsonb := to_jsonb(NEW);
	v_column text;
BEGIN
	-- The number, the period and who started it are fixed from the first moment — a count that
	-- renumbered or re-dated itself mid-flight would make its own lines meaningless.
	FOREACH v_column IN ARRAY v_frozen LOOP
		IF (v_before -> v_column) IS DISTINCT FROM (v_after -> v_column) THEN
			-- `applied_at` and `applied_by_user_id` move exactly once, on the transition into
			-- `applied`. That one write is allowed through here.
			IF v_column IN ('applied_at', 'applied_by_user_id')
			   AND OLD.status <> 'applied' AND NEW.status = 'applied' THEN
				CONTINUE;
			END IF;

			RAISE EXCEPTION
				'stock count % is fixed once it has been prepared, so "%" cannot be changed.',
				OLD.number_formatted, v_column
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;
	END LOOP;

	-- ── The states a count may move between ──────────────────────────────────────────
	--
	--   preparing -> counting -> reviewing -> applied
	--   reviewing -> counting            going back for another look, which is the whole point
	--
	-- `applied` is terminal. Anything leaving it is a count being run a second time, and the
	-- movements it wrote the first time are already in the ledger.
	IF NEW.status IS DISTINCT FROM OLD.status THEN
		IF OLD.status = 'applied' THEN
			RAISE EXCEPTION
				'stock count % has been applied to your stock, and that cannot be undone. Start a new count, or record a correcting movement.',
				OLD.number_formatted
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;

		IF NEW.status = 'preparing' THEN
			RAISE EXCEPTION
				'stock count % has already been prepared, so it cannot go back to preparing — the expected quantities are a snapshot of that moment.',
				OLD.number_formatted
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "inventory_stock_count_freeze" BEFORE UPDATE ON "inventory_stock_count"
	FOR EACH ROW EXECUTE FUNCTION "app".freeze_applied_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app".freeze_count_snapshot() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	v_status text;
BEGIN
	SELECT status INTO v_status
	  FROM inventory_stock_count
	 WHERE id = COALESCE(NEW.stock_count_id, OLD.stock_count_id);

	-- A line may only be ADDED while the count is still being prepared. After that the sheet is
	-- the sheet, and an extra row is an item nobody was asked to look for.
	IF TG_OP = 'INSERT' THEN
		IF v_status <> 'preparing' THEN
			RAISE EXCEPTION
				'this stock count has already been prepared, so no more lines can be added to it.'
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;
		RETURN NEW;
	END IF;

	IF v_status = 'applied' THEN
		RAISE EXCEPTION
			'this stock count has been applied to your stock, so its lines cannot be changed.'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;

	-- THE SNAPSHOT ITSELF. Everything a counter is comparing against is fixed at preparation;
	-- what they type — the counted quantity, when, and by whom — is not.
	IF v_status <> 'preparing' THEN
		IF NEW.expected_qty_e6 IS DISTINCT FROM OLD.expected_qty_e6 THEN
			RAISE EXCEPTION
				'the expected quantity on a stock count line is a snapshot taken when the count was prepared, and cannot change while the count is open.'
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;
		IF NEW.item_id IS DISTINCT FROM OLD.item_id
		   OR NEW.location_id IS DISTINCT FROM OLD.location_id
		   OR NEW.unit_cost_micros IS DISTINCT FROM OLD.unit_cost_micros THEN
			RAISE EXCEPTION
				'a stock count line names one item, in one place, at the cost it carried when the count was prepared. None of those can change mid-count.'
				USING ERRCODE = 'integrity_constraint_violation';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "inventory_stock_count_line_freeze"
	BEFORE INSERT OR UPDATE ON "inventory_stock_count_line"
	FOR EACH ROW EXECUTE FUNCTION "app".freeze_count_snapshot();
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- QUANTITY ON HAND — DERIVED, AND THEREFORE UNWRITABLE
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- T23's criterion, in its own words: "`inventory_level` cannot be written directly; it is derived
-- from movements. A directly-writable quantity column is how stock silently diverges from its own
-- history."
--
-- A VIEW, not a table maintained by a trigger. Three reasons, in order of importance:
--
--  1. THERE IS NOTHING TO DIVERGE. A trigger-maintained column is a second copy of the truth, and
--     the maintainer needs an escape hatch through its own refusal trigger — a documented hole in
--     the wall the trigger exists to build. A `sum()` has neither.
--
--  2. POSTGRES ITSELF REFUSES THE WRITE. A view containing `GROUP BY` is not auto-updatable, so
--     INSERT and UPDATE fail in the server regardless of grants. The REVOKE below is belt and
--     braces: it turns the refusal into a stable `permission denied for view` that a test can
--     assert on, rather than a message about view internals that could change between releases.
--
--  3. `security_invoker = true` IS LOAD-BEARING. Without it the view executes as its OWNER — the
--     DDL role, which `FORCE ROW LEVEL SECURITY` does not constrain — and every business would
--     read every other's stock levels while the screen looked perfect. With it, `tenant_isolation`
--     on `inventory_movement` is evaluated as `cjs_app`, whose lack of SUPERUSER and BYPASSRLS
--     `scripts/invariants.sql` already proves.
--
--     Requires PostgreSQL 15 or later. `schema/inventory.test.ts` asserts `server_version_num`
--     rather than assuming it, so a downgrade fails loudly instead of leaking quietly.
--
-- NOTE FOR WHOEVER READS `invariants.sql` NEXT: all of its assertions filter on
-- `relkind IN ('r','p')`, so a view is never examined by any of them. That is the correct
-- classification — a view has no rows of its own to be a tenant of — but it does mean the usual
-- safety net does not cover this relation. The tenancy test is the net instead.

CREATE VIEW "inventory_level" WITH (security_invoker = true) AS
	SELECT m.business_id,
	       m.item_id,
	       m.location_id,
	       sum(m.qty_e6)      AS qty_e6,
	       max(m.occurred_on) AS last_moved_on,
	       max(m.created_at)  AS last_recorded_at
	  FROM inventory_movement m
	 GROUP BY m.business_id, m.item_id, m.location_id;
--> statement-breakpoint

-- 0003's `ALTER DEFAULT PRIVILEGES ... ON TABLES` attaches to VIEWS as well as tables, so the
-- application role would otherwise arrive holding INSERT and UPDATE on this. Taken back
-- explicitly — see reason 2 above.
REVOKE ALL ON "inventory_level" FROM "cjs_app";
--> statement-breakpoint
GRANT SELECT ON "inventory_level" TO "cjs_app";
