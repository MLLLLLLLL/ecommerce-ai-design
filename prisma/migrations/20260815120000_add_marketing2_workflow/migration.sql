-- AlterTable: 营销助手2资产版本追踪（V2 6.3）
ALTER TABLE "Asset" ADD COLUMN     "marketingTaskId" TEXT;
ALTER TABLE "Asset" ADD COLUMN     "parentAssetId" TEXT;
ALTER TABLE "Asset" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN     "derivedReason" TEXT;
ALTER TABLE "Asset" ADD COLUMN     "stepKey" TEXT;

-- AlterTable: 营销助手2工作流字段（V2 6.1）
ALTER TABLE "MarketingTask" ADD COLUMN     "workflowKey" TEXT;
ALTER TABLE "MarketingTask" ADD COLUMN     "workflowVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MarketingTask" ADD COLUMN     "currentStep" TEXT;
ALTER TABLE "MarketingTask" ADD COLUMN     "taskVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MarketingTask" ADD COLUMN     "awaitingReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketingTask" ADD COLUMN     "stepModels" JSONB;
ALTER TABLE "MarketingTask" ADD COLUMN     "stepResults" JSONB;
ALTER TABLE "MarketingTask" ADD COLUMN     "pausedAt" TIMESTAMP(3);

-- AlterTable: 营销助手2子项字段（V2 6.2）
ALTER TABLE "MarketingTaskItem" ADD COLUMN     "stepKey" TEXT;
ALTER TABLE "MarketingTaskItem" ADD COLUMN     "itemVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MarketingTaskItem" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE INDEX "Asset_marketingTaskId_idx" ON "Asset"("marketingTaskId");

-- CreateIndex
CREATE INDEX "Asset_parentAssetId_idx" ON "Asset"("parentAssetId");

-- CreateIndex
CREATE INDEX "MarketingTask_userId_workflowKey_idx" ON "MarketingTask"("userId", "workflowKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingTaskItem_idempotencyKey_key" ON "MarketingTaskItem"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingTaskItem_taskId_stepKey_idx" ON "MarketingTaskItem"("taskId", "stepKey");
