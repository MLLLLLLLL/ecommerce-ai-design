-- CreateTable
CREATE TABLE "MarketingTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productImages" TEXT[],
    "category" TEXT,
    "platform" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "analysis" JSONB,
    "copywriting" JSONB,
    "mainPrompts" JSONB,
    "detailPrompts" JSONB,
    "sellPoints" TEXT[],
    "keywords" TEXT[],
    "parameters" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingTask_userId_createdAt_idx" ON "MarketingTask"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingTask_status_idx" ON "MarketingTask"("status");

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
