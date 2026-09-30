-- DropForeignKey
ALTER TABLE "WbsNode" DROP CONSTRAINT "WbsNode_parentId_fkey";

-- AddForeignKey
ALTER TABLE "WbsNode" ADD CONSTRAINT "WbsNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WbsNode"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
