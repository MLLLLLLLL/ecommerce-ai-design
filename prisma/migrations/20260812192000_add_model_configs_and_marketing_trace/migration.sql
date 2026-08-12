-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "baseURL" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "MarketingTask"
ADD COLUMN "modelSnapshot" JSONB,
ADD COLUMN "executionSteps" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "ModelConfig_userId_name_key" ON "ModelConfig"("userId", "name");
CREATE INDEX "ModelConfig_userId_isActive_idx" ON "ModelConfig"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "ModelConfig"
ADD CONSTRAINT "ModelConfig_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
