ALTER TABLE "Business" ADD COLUMN "aiInsightQueuedAt" TIMESTAMP(3);
ALTER TABLE "InsightBatch" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
CREATE INDEX "Business_aiInsightQueuedAt_idx" ON "Business"("aiInsightQueuedAt");
