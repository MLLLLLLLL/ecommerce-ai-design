-- AlterTable
ALTER TABLE "MarketingTask" ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MarketingTaskItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT,
    "modelId" TEXT,
    "dependsOn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB,
    "result" JSONB,
    "error" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchServiceConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'tavily',
    "baseURL" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "testStatus" TEXT,
    "testError" TEXT,
    "maxQueriesPerTask" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchServiceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingTaskItem_userId_taskId_idx" ON "MarketingTaskItem"("userId", "taskId");

-- CreateIndex
CREATE INDEX "MarketingTaskItem_status_leaseExpiresAt_idx" ON "MarketingTaskItem"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "MarketingTaskItem_taskId_createdAt_idx" ON "MarketingTaskItem"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingTaskEvent_taskId_createdAt_idx" ON "MarketingTaskEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingTaskEvent_userId_createdAt_idx" ON "MarketingTaskEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchServiceConfig_userId_isActive_idx" ON "SearchServiceConfig"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SearchServiceConfig_userId_name_key" ON "SearchServiceConfig"("userId", "name");

-- AddForeignKey
ALTER TABLE "MarketingTaskItem" ADD CONSTRAINT "MarketingTaskItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MarketingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTaskEvent" ADD CONSTRAINT "MarketingTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MarketingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchServiceConfig" ADD CONSTRAINT "SearchServiceConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
