-- AlterTable
ALTER TABLE "ModelConfig" ADD COLUMN     "lastTestedAt" TIMESTAMP(3),
ADD COLUMN     "testError" TEXT,
ADD COLUMN     "testStatus" TEXT,
ADD COLUMN     "testedCapabilities" JSONB;
