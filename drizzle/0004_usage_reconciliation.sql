-- Additive migration: Inventory Usage & Reconciliation.
-- Safe / idempotent: creates only new tables and indexes. Drops nothing.
-- (The Drizzle snapshot still contains the earlier removed production
--  tables, so `drizzle-kit generate` would emit destructive DROPs; this
--  hand-written migration intentionally avoids that.)

CREATE TABLE IF NOT EXISTS "manual_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE cascade,
	"quantity_base" integer NOT NULL,
	"unit_cost_poisha" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"movement_id" uuid,
	"recorded_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"cancelled_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconciliation_date" date NOT NULL,
	"ingredient_id" uuid NOT NULL REFERENCES "ingredients"("id") ON DELETE cascade,
	"expected_base" integer NOT NULL,
	"actual_base" integer NOT NULL,
	"difference_base" integer NOT NULL,
	"explanation" text,
	"adjustment_movement_id" uuid,
	"confirmed_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_usage_created_idx" ON "manual_usage_records" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_usage_ingredient_idx" ON "manual_usage_records" ("ingredient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reconciliations_date_idx" ON "stock_reconciliations" ("reconciliation_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_reconciliations_date_ingredient_unique" ON "stock_reconciliations" ("reconciliation_date","ingredient_id");