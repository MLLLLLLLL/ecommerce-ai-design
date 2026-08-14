-- AlterTable
ALTER TABLE "MarketingTask" ADD COLUMN     "input" JSONB,
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "module" TEXT NOT NULL DEFAULT 'copywriting',
ADD COLUMN     "result" JSONB,
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "selectedOutputs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "MarketingTask_userId_module_isFavorite_idx" ON "MarketingTask"("userId", "module", "isFavorite");
