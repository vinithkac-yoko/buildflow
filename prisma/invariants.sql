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

-- ═════════════════ Part 2 — procurement (milestone 4; applied by the *_procurement migration) ═════════════════

-- Quantities and money are never impossible; a PO line can never be received beyond what was ordered;
-- an invoice can never be paid beyond its total.
ALTER TABLE "MaterialRequestItem"  ADD CONSTRAINT mr_item_qty_positive       CHECK (quantity > 0);
ALTER TABLE "PurchaseRequestItem"  ADD CONSTRAINT pr_item_qty_positive       CHECK (quantity > 0);
ALTER TABLE "VendorQuotationItem"  ADD CONSTRAINT quotation_item_valid       CHECK ("unitRate" >= 0 AND "taxPct" >= 0 AND "taxPct" <= 100);
ALTER TABLE "PurchaseOrderItem"    ADD CONSTRAINT po_item_valid              CHECK (quantity > 0 AND "unitRate" >= 0 AND "taxPct" >= 0 AND "taxPct" <= 100 AND "receivedQty" >= 0 AND "receivedQty" <= quantity);
ALTER TABLE "MaterialReceiptItem"  ADD CONSTRAINT receipt_item_qty_positive  CHECK (quantity > 0);
ALTER TABLE "VendorInvoice"        ADD CONSTRAINT invoice_amounts_valid      CHECK ("invoiceTotal" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "invoiceTotal");
ALTER TABLE "VendorPayment"        ADD CONSTRAINT payment_amount_positive    CHECK ("paymentAmount" > 0);

-- The same invoice number can't be entered twice for one vendor: UNIQUE("vendorId","invoiceNo") is in schema.prisma.

-- ═════════════════ Part 3 — quality (milestone 5; applied by the *_quality migration) ═════════════════

-- Checkpoint counts are never impossible, a completed inspection always has a result, and an NCR is closed
-- if and only if it has a closure time. Rework costs and time lost can't be negative.
ALTER TABLE "QualityInspection" ADD CONSTRAINT inspection_counts_valid    CHECK ("totalCheckpoints" >= 0 AND "passedCheckpoints" >= 0 AND "passedCheckpoints" <= "totalCheckpoints");
ALTER TABLE "QualityInspection" ADD CONSTRAINT inspection_completed_valid CHECK (status = 'REQUESTED' OR (result IS NOT NULL AND "inspectionDate" IS NOT NULL AND "totalCheckpoints" > 0));
ALTER TABLE "Ncr"               ADD CONSTRAINT ncr_amounts_valid          CHECK ("reworkLabourCost" >= 0 AND "reworkMaterialCost" >= 0 AND "timeLostDays" >= 0);
ALTER TABLE "Ncr"               ADD CONSTRAINT ncr_closed_valid           CHECK ((status = 'CLOSED') = ("closedAt" IS NOT NULL));
