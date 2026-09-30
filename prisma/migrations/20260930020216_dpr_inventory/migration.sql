-- CreateEnum
CREATE TYPE "DprStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Weather" AS ENUM ('SUNNY', 'CLOUDY', 'RAIN', 'HEAVY_RAIN');

-- CreateEnum
CREATE TYPE "LabourSource" AS ENUM ('COMPANY_EMPLOYEE', 'CONTRACT_LABOUR', 'PIECE_RATE', 'SUBCONTRACTOR');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('OPENING_STOCK', 'PO_RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ACTIVITY_ISSUE', 'ACTIVITY_RETURN', 'WASTAGE', 'THEFT_LOSS');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "actualFinish" DATE,
ADD COLUMN     "actualMandays" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "actualQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN     "actualStart" DATE;

-- CreateTable
CREATE TABLE "Dpr" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "status" "DprStatus" NOT NULL DEFAULT 'DRAFT',
    "weather" "Weather",
    "remarks" TEXT,
    "noWork" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "clientTxnId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dpr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DprActivityProgress" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "location" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DprActivityProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabourLog" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "source" "LabourSource" NOT NULL,
    "tradeId" TEXT NOT NULL,
    "subcontractorId" TEXT,
    "headcount" INTEGER NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "mandays" DECIMAL(10,3) NOT NULL,
    "dailyLabourCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "enteredById" TEXT NOT NULL,
    "clientTxnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabourLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DprMaterialUse" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DprMaterialUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DprPhoto" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "clientTxnId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DprPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "dprId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "IssueSeverity" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "targetResolutionDate" DATE,
    "resolvedAt" TIMESTAMP(3),
    "reportedById" TEXT NOT NULL,
    "clientTxnId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedger" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storageLocationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activityId" TEXT,
    "dprId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "clientTxnId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storageLocationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "avgCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dpr_clientTxnId_key" ON "Dpr"("clientTxnId");

-- CreateIndex
CREATE INDEX "Dpr_projectId_status_idx" ON "Dpr"("projectId", "status");

-- CreateIndex
CREATE INDEX "Dpr_reportDate_idx" ON "Dpr"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "Dpr_projectId_reportDate_key" ON "Dpr"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "DprActivityProgress_projectId_activityId_idx" ON "DprActivityProgress"("projectId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "DprActivityProgress_dprId_activityId_enteredById_key" ON "DprActivityProgress"("dprId", "activityId", "enteredById");

-- CreateIndex
CREATE UNIQUE INDEX "LabourLog_clientTxnId_key" ON "LabourLog"("clientTxnId");

-- CreateIndex
CREATE INDEX "LabourLog_projectId_activityId_idx" ON "LabourLog"("projectId", "activityId");

-- CreateIndex
CREATE INDEX "LabourLog_dprId_idx" ON "LabourLog"("dprId");

-- CreateIndex
CREATE INDEX "DprMaterialUse_projectId_materialId_idx" ON "DprMaterialUse"("projectId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "DprMaterialUse_dprId_activityId_materialId_enteredById_key" ON "DprMaterialUse"("dprId", "activityId", "materialId", "enteredById");

-- CreateIndex
CREATE UNIQUE INDEX "DprPhoto_fileKey_key" ON "DprPhoto"("fileKey");

-- CreateIndex
CREATE UNIQUE INDEX "DprPhoto_clientTxnId_key" ON "DprPhoto"("clientTxnId");

-- CreateIndex
CREATE INDEX "DprPhoto_dprId_idx" ON "DprPhoto"("dprId");

-- CreateIndex
CREATE INDEX "DprPhoto_projectId_createdAt_idx" ON "DprPhoto"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_code_key" ON "Issue"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_clientTxnId_key" ON "Issue"("clientTxnId");

-- CreateIndex
CREATE INDEX "Issue_projectId_status_idx" ON "Issue"("projectId", "status");

-- CreateIndex
CREATE INDEX "Issue_severity_status_idx" ON "Issue"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLedger_clientTxnId_key" ON "InventoryLedger"("clientTxnId");

-- CreateIndex
CREATE INDEX "InventoryLedger_projectId_materialId_createdAt_idx" ON "InventoryLedger"("projectId", "materialId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryLedger_dprId_idx" ON "InventoryLedger"("dprId");

-- CreateIndex
CREATE INDEX "StockBalance_projectId_materialId_idx" ON "StockBalance"("projectId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_projectId_storageLocationId_materialId_key" ON "StockBalance"("projectId", "storageLocationId", "materialId");

-- AddForeignKey
ALTER TABLE "Dpr" ADD CONSTRAINT "Dpr_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dpr" ADD CONSTRAINT "Dpr_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dpr" ADD CONSTRAINT "Dpr_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dpr" ADD CONSTRAINT "Dpr_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprActivityProgress" ADD CONSTRAINT "DprActivityProgress_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "Dpr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprActivityProgress" ADD CONSTRAINT "DprActivityProgress_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourLog" ADD CONSTRAINT "LabourLog_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "Dpr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourLog" ADD CONSTRAINT "LabourLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourLog" ADD CONSTRAINT "LabourLog_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourLog" ADD CONSTRAINT "LabourLog_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprMaterialUse" ADD CONSTRAINT "DprMaterialUse_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "Dpr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprMaterialUse" ADD CONSTRAINT "DprMaterialUse_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprMaterialUse" ADD CONSTRAINT "DprMaterialUse_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprPhoto" ADD CONSTRAINT "DprPhoto_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "Dpr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "Dpr"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============ invariants (copied from prisma/invariants.sql) ============
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
