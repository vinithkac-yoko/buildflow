-- DropForeignKey
ALTER TABLE "DprActivityProgress" DROP CONSTRAINT "DprActivityProgress_activityId_fkey";

-- DropForeignKey
ALTER TABLE "DprMaterialUse" DROP CONSTRAINT "DprMaterialUse_activityId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryLedger" DROP CONSTRAINT "InventoryLedger_activityId_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_activityId_fkey";

-- DropForeignKey
ALTER TABLE "LabourLog" DROP CONSTRAINT "LabourLog_activityId_fkey";

-- AddForeignKey
ALTER TABLE "DprActivityProgress" ADD CONSTRAINT "DprActivityProgress_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabourLog" ADD CONSTRAINT "LabourLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DprMaterialUse" ADD CONSTRAINT "DprMaterialUse_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
