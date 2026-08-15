-- Prevent duplicate MarketingTask records when the same create request is retried.
ALTER TABLE "MarketingTask" ADD COLUMN "createIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "MarketingTask_userId_createIdempotencyKey_key"
ON "MarketingTask"("userId", "createIdempotencyKey");
