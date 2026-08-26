CREATE TABLE "InsightBatch" (
  "id" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "onlyMissing" BOOLEAN NOT NULL DEFAULT true,
  "status" "JobState" NOT NULL DEFAULT 'WAITING',
  "totalBusinesses" INTEGER NOT NULL DEFAULT 0,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "generatedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InsightBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InsightBatch_status_updatedAt_idx" ON "InsightBatch"("status", "updatedAt");
