-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'HALTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EquipmentOwnership" AS ENUM ('COMPANY', 'RENTAL', 'SUBCONTRACTOR');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "StorageKind" AS ENUM ('MAIN_STORE', 'YARD', 'FLOOR_STORE', 'WAREHOUSE', 'OTHER');

-- CreateTable
CREATE TABLE "CodeSequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CodeSequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AppMeta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppMeta_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Uom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "uomId" TEXT NOT NULL,
    "standardUnitCost" DECIMAL(14,2) NOT NULL,
    "reorderThreshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeId" TEXT,
    "phone" TEXT,
    "dailyWage" DECIMAL(12,2),
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLabourGang" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "contact" TEXT,
    "ratePerManday" DECIMAL(12,2),
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ContractLabourGang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contact" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "qualityRating" INTEGER,
    "deliveryRating" INTEGER,
    "priceRating" INTEGER,
    "serviceRating" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "contact" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ownership" "EquipmentOwnership" NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityChecklist" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "QualityChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sop" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Sop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StorageKind" NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbsNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "WbsNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "costCodeId" TEXT,
    "tradeId" TEXT,
    "uomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plannedQty" DECIMAL(14,3) NOT NULL,
    "plannedStart" DATE NOT NULL,
    "plannedFinish" DATE NOT NULL,
    "plannedMandays" DECIMAL(12,2) NOT NULL,
    "plannedCost" DECIMAL(16,2) NOT NULL,
    "targetProductivity" DECIMAL(12,3),
    "criticalPath" BOOLEAN NOT NULL DEFAULT false,
    "status" "ActivityStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uomId" TEXT NOT NULL,
    "originalQty" DECIMAL(14,3) NOT NULL,
    "approvedVariationQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "clientRate" DECIMAL(14,2) NOT NULL,
    "internalBudgetRate" DECIMAL(14,2) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "BoqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "note" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "BoqRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqItemRevision" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "originalQty" DECIMAL(14,3) NOT NULL,
    "approvedVariationQty" DECIMAL(14,3) NOT NULL,
    "clientRate" DECIMAL(14,2) NOT NULL,
    "internalBudgetRate" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "BoqItemRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityBoqLink" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityBoqLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialBom" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "coefficient" DECIMAL(14,4) NOT NULL,
    "wastagePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialBom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Uom_code_key" ON "Uom"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_name_key" ON "MaterialCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

-- CreateIndex
CREATE INDEX "Material_categoryId_idx" ON "Material"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_code_key" ON "CostCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_name_key" ON "Trade"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractLabourGang_code_key" ON "ContractLabourGang"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subcontractor_code_key" ON "Subcontractor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "QualityChecklist_code_key" ON "QualityChecklist"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_checklistId_seq_key" ON "ChecklistItem"("checklistId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Sop_code_key" ON "Sop"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_projectId_name_key" ON "StorageLocation"("projectId", "name");

-- CreateIndex
CREATE INDEX "WbsNode_projectId_parentId_idx" ON "WbsNode"("projectId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "WbsNode_projectId_code_key" ON "WbsNode"("projectId", "code");

-- CreateIndex
CREATE INDEX "Activity_projectId_status_idx" ON "Activity"("projectId", "status");

-- CreateIndex
CREATE INDEX "Activity_wbsNodeId_idx" ON "Activity"("wbsNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_projectId_code_key" ON "Activity"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BoqItem_projectId_itemCode_key" ON "BoqItem"("projectId", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "BoqRevision_projectId_number_key" ON "BoqRevision"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "BoqItemRevision_revisionId_boqItemId_key" ON "BoqItemRevision"("revisionId", "boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityBoqLink_activityId_boqItemId_key" ON "ActivityBoqLink"("activityId", "boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialBom_activityId_materialId_key" ON "MaterialBom"("activityId", "materialId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLabourGang" ADD CONSTRAINT "ContractLabourGang_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontractor" ADD CONSTRAINT "Subcontractor_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "QualityChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WbsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "WbsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqRevision" ADD CONSTRAINT "BoqRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItemRevision" ADD CONSTRAINT "BoqItemRevision_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BoqRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItemRevision" ADD CONSTRAINT "BoqItemRevision_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBoqLink" ADD CONSTRAINT "ActivityBoqLink_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBoqLink" ADD CONSTRAINT "ActivityBoqLink_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialBom" ADD CONSTRAINT "MaterialBom_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialBom" ADD CONSTRAINT "MaterialBom_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
