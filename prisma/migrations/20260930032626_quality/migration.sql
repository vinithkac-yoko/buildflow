-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('REQUESTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('PASS', 'CONDITIONAL_PASS', 'REJECTED_NCR');

-- CreateEnum
CREATE TYPE "NcrSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NcrStatus" AS ENUM ('OPEN', 'CORRECTIVE_ACTION', 'RECTIFICATION', 'REINSPECTION', 'CLOSED');

-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'REQUESTED',
    "inspectionDate" DATE,
    "requestedById" TEXT,
    "requestNote" TEXT,
    "inspectorId" TEXT,
    "subcontractorId" TEXT,
    "totalCheckpoints" INTEGER NOT NULL DEFAULT 0,
    "passedCheckpoints" INTEGER NOT NULL DEFAULT 0,
    "result" "InspectionOutcome",
    "remarks" TEXT,
    "isReinspection" BOOLEAN NOT NULL DEFAULT false,
    "ncrId" TEXT,
    "clientTxnId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "materialId" TEXT,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "note" TEXT,

    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ncr" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT,
    "inspectionId" TEXT,
    "subcontractorId" TEXT,
    "severity" "NcrSeverity" NOT NULL,
    "defect" TEXT NOT NULL,
    "status" "NcrStatus" NOT NULL DEFAULT 'OPEN',
    "correctiveAction" TEXT,
    "rectificationNote" TEXT,
    "reworkLabourCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reworkMaterialCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "timeLostDays" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "raisedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closureHours" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "materialId" TEXT,

    CONSTRAINT "Ncr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NcrAction" (
    "id" TEXT NOT NULL,
    "ncrId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NcrAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspection_code_key" ON "QualityInspection"("code");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspection_clientTxnId_key" ON "QualityInspection"("clientTxnId");

-- CreateIndex
CREATE INDEX "QualityInspection_projectId_status_idx" ON "QualityInspection"("projectId", "status");

-- CreateIndex
CREATE INDEX "QualityInspection_activityId_idx" ON "QualityInspection"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionResult_inspectionId_seq_key" ON "InspectionResult"("inspectionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Ncr_code_key" ON "Ncr"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Ncr_inspectionId_key" ON "Ncr"("inspectionId");

-- CreateIndex
CREATE INDEX "Ncr_projectId_status_idx" ON "Ncr"("projectId", "status");

-- CreateIndex
CREATE INDEX "NcrAction_ncrId_idx" ON "NcrAction"("ncrId");

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "QualityChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcrAction" ADD CONSTRAINT "NcrAction_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcrAction" ADD CONSTRAINT "NcrAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════ Part 3 — quality (milestone 5; applied by the *_quality migration) ═════════════════

-- Checkpoint counts are never impossible, a completed inspection always has a result, and an NCR is closed
-- if and only if it has a closure time. Rework costs and time lost can't be negative.
ALTER TABLE "QualityInspection" ADD CONSTRAINT inspection_counts_valid    CHECK ("totalCheckpoints" >= 0 AND "passedCheckpoints" >= 0 AND "passedCheckpoints" <= "totalCheckpoints");
ALTER TABLE "QualityInspection" ADD CONSTRAINT inspection_completed_valid CHECK (status = 'REQUESTED' OR (result IS NOT NULL AND "inspectionDate" IS NOT NULL AND "totalCheckpoints" > 0));
ALTER TABLE "Ncr"               ADD CONSTRAINT ncr_amounts_valid          CHECK ("reworkLabourCost" >= 0 AND "reworkMaterialCost" >= 0 AND "timeLostDays" >= 0);
ALTER TABLE "Ncr"               ADD CONSTRAINT ncr_closed_valid           CHECK ((status = 'CLOSED') = ("closedAt" IS NOT NULL));
