-- BUILDFlow database invariants.
-- The app validates these first so users get friendly messages; the database is the final guard.
-- This file is the source of truth: it is copied verbatim into the migration that applies it
-- (prisma/migrations/*_invariants/migration.sql). Edit here, then add a NEW migration for changes.

-- 1. Stock can never be negative, per project + storage location + material.
ALTER TABLE "StockBalance"
  ADD CONSTRAINT stock_balance_non_negative CHECK (quantity >= 0);

-- 2. The inventory ledger is append-only. The only exception is the demo reset, which sets
--    bf.allow_ledger_delete = 'on' for its own transaction before deleting demo projects.
CREATE OR REPLACE FUNCTION bf_ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('bf.allow_ledger_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'InventoryLedger is append-only (% not allowed)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_ledger_append_only
  BEFORE UPDATE OR DELETE ON "InventoryLedger"
  FOR EACH ROW EXECUTE FUNCTION bf_ledger_append_only();

-- 3. Quantities and labour are never impossible.
ALTER TABLE "InventoryLedger"       ADD CONSTRAINT ledger_qty_positive        CHECK (quantity > 0);
ALTER TABLE "DprActivityProgress"   ADD CONSTRAINT progress_qty_non_negative  CHECK (quantity >= 0);
ALTER TABLE "DprMaterialUse"        ADD CONSTRAINT material_use_qty_positive  CHECK (quantity > 0);
ALTER TABLE "LabourLog"             ADD CONSTRAINT labour_hours_range         CHECK (hours > 0 AND hours <= 16);
ALTER TABLE "LabourLog"             ADD CONSTRAINT labour_headcount_positive  CHECK (headcount > 0);
ALTER TABLE "Activity"              ADD CONSTRAINT activity_quantities_valid  CHECK ("plannedQty" > 0 AND "actualQty" >= 0);

-- 4. One DPR per project per day (UNIQUE("projectId","reportDate")) and unique client transaction ids
--    on every table that can be written offline are declared in schema.prisma.
