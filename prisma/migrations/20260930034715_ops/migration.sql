-- CreateEnum
CREATE TYPE "DelayCategory" AS ENUM ('WEATHER', 'MATERIAL_SUPPLY', 'LABOUR_AVAILABILITY', 'DRAWING_APPROVAL', 'CLIENT_DECISION', 'SUBCONTRACTOR_PERFORMANCE', 'EQUIPMENT', 'DESIGN_CHANGE', 'QUALITY_REWORK', 'UTILITIES_PERMITS', 'OTHER');

-- CreateEnum
CREATE TYPE "ResponsibleFunction" AS ENUM ('SITE_EXECUTION', 'PROCUREMENT', 'DESIGN', 'PLANNING', 'QUALITY', 'CLIENT_SIDE', 'FINANCE', 'EXTERNAL_AUTHORITY');

-- CreateEnum
CREATE TYPE "EquipmentLogKind" AS ENUM ('USAGE', 'MAINTENANCE', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('AGREEMENT', 'BOQ', 'DRAWINGS', 'DPR', 'PURCHASE_ORDERS', 'INVOICES', 'QUALITY', 'PAYMENT', 'HANDOVER', 'PHOTOS');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'APPROVED', 'REJECTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('ISSUED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Delay" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "category" "DelayCategory" NOT NULL,
    "delayFactor" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "daysLost" INTEGER NOT NULL,
    "criticalPathImpact" BOOLEAN NOT NULL DEFAULT false,
    "costImpact" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "evidence" TEXT NOT NULL,
    "impact" TEXT,
    "responsibleFunction" "ResponsibleFunction" NOT NULL,
    "correctiveAction" TEXT,
    "recordedById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "materialId" TEXT,

    CONSTRAINT "Delay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAssignment" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "note" TEXT,
    "assignedById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT,

    CONSTRAINT "EquipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentLog" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "logDate" DATE NOT NULL,
    "kind" "EquipmentLogKind" NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "loggedById" TEXT NOT NULL,
    "clientTxnId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT,

    CONSTRAINT "EquipmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "statusNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedOn" DATE NOT NULL,
    "issuedById" TEXT NOT NULL,
    "cancelReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderItem" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uomId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "workRate" DECIMAL(14,2) NOT NULL,
    "measuredQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "materialId" TEXT,

    CONSTRAINT "WorkOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderMeasurement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "measuredOn" DATE NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "note" TEXT,
    "measuredById" TEXT NOT NULL,
    "billId" TEXT,
    "clientTxnId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorBill" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "billDate" DATE NOT NULL,
    "dueDate" DATE,
    "billGross" DECIMAL(16,2) NOT NULL,
    "retentionPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "billRetention" DECIMAL(16,2) NOT NULL,
    "billNet" DECIMAL(16,2) NOT NULL,
    "billPaid" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "enteredById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractorBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorPayment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "subPaymentAmount" DECIMAL(16,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "paidById" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delay_code_key" ON "Delay"("code");

-- CreateIndex
CREATE INDEX "Delay_projectId_idx" ON "Delay"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_equipmentId_idx" ON "EquipmentAssignment"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_projectId_idx" ON "EquipmentAssignment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentLog_clientTxnId_key" ON "EquipmentLog"("clientTxnId");

-- CreateIndex
CREATE INDEX "EquipmentLog_equipmentId_logDate_idx" ON "EquipmentLog"("equipmentId", "logDate");

-- CreateIndex
CREATE INDEX "EquipmentLog_projectId_idx" ON "EquipmentLog"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_code_key" ON "Document"("code");

-- CreateIndex
CREATE INDEX "Document_projectId_category_idx" ON "Document"("projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_code_key" ON "WorkOrder"("code");

-- CreateIndex
CREATE INDEX "WorkOrder_projectId_status_idx" ON "WorkOrder"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderMeasurement_clientTxnId_key" ON "WorkOrderMeasurement"("clientTxnId");

-- CreateIndex
CREATE INDEX "WorkOrderMeasurement_itemId_idx" ON "WorkOrderMeasurement"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorBill_code_key" ON "SubcontractorBill"("code");

-- CreateIndex
CREATE INDEX "SubcontractorBill_projectId_status_idx" ON "SubcontractorBill"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorBill_subcontractorId_billNo_key" ON "SubcontractorBill"("subcontractorId", "billNo");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorPayment_code_key" ON "SubcontractorPayment"("code");

-- AddForeignKey
ALTER TABLE "Delay" ADD CONSTRAINT "Delay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delay" ADD CONSTRAINT "Delay_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delay" ADD CONSTRAINT "Delay_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delay" ADD CONSTRAINT "Delay_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMeasurement" ADD CONSTRAINT "WorkOrderMeasurement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorkOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMeasurement" ADD CONSTRAINT "WorkOrderMeasurement_measuredById_fkey" FOREIGN KEY ("measuredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMeasurement" ADD CONSTRAINT "WorkOrderMeasurement_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SubcontractorBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorBill" ADD CONSTRAINT "SubcontractorBill_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorBill" ADD CONSTRAINT "SubcontractorBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorBill" ADD CONSTRAINT "SubcontractorBill_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorBill" ADD CONSTRAINT "SubcontractorBill_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorPayment" ADD CONSTRAINT "SubcontractorPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SubcontractorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorPayment" ADD CONSTRAINT "SubcontractorPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorPayment" ADD CONSTRAINT "SubcontractorPayment_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════ Part 4 — delays, equipment, documents, work orders (milestone 6; applied by the *_ops migration) ═════════════════

-- A delay's dates and cost are never impossible. Equipment hours fit in a day, and a piece of equipment sits on
-- one project at a time (only one open assignment).
ALTER TABLE "Delay"               ADD CONSTRAINT delay_valid                CHECK ("daysLost" >= 0 AND "costImpact" >= 0 AND ("endDate" IS NULL OR "endDate" >= "startDate"));
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT assignment_dates_valid     CHECK ("toDate" IS NULL OR "toDate" >= "fromDate");
CREATE UNIQUE INDEX equipment_one_open_assignment ON "EquipmentAssignment" ("equipmentId") WHERE "toDate" IS NULL;
ALTER TABLE "EquipmentLog"        ADD CONSTRAINT equipment_hours_valid      CHECK (hours >= 0 AND hours <= 24 AND (kind <> 'USAGE' OR hours > 0));

-- Only the latest version of a document is CURRENT; versions are numbered from 1.
ALTER TABLE "DocumentVersion"     ADD CONSTRAINT document_version_valid     CHECK (version >= 1 AND "sizeBytes" > 0);
CREATE UNIQUE INDEX document_one_current_version ON "DocumentVersion" ("documentId") WHERE "isCurrent";

-- Work orders: a line can never be measured beyond its ordered quantity; bills add up; a bill can never be paid beyond what is payable.
ALTER TABLE "WorkOrderItem"       ADD CONSTRAINT work_item_valid            CHECK (quantity > 0 AND "workRate" >= 0 AND "measuredQty" >= 0 AND "measuredQty" <= quantity);
ALTER TABLE "WorkOrderMeasurement" ADD CONSTRAINT measurement_qty_positive  CHECK (quantity > 0);
ALTER TABLE "SubcontractorBill"   ADD CONSTRAINT sub_bill_amounts_valid     CHECK ("billGross" >= 0 AND "billRetention" >= 0 AND "billNet" = "billGross" - "billRetention" AND "billPaid" >= 0 AND "billPaid" <= "billNet" AND "retentionPct" >= 0 AND "retentionPct" <= 100);
ALTER TABLE "SubcontractorPayment" ADD CONSTRAINT sub_payment_positive      CHECK ("subPaymentAmount" > 0);
