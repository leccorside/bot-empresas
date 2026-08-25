ALTER TABLE "Business"
ADD COLUMN "siteFinalUrl" TEXT,
ADD COLUMN "siteSslValid" BOOLEAN,
ADD COLUMN "hasViewport" BOOLEAN,
ADD COLUMN "metaDescription" TEXT,
ADD COLUMN "isWordPress" BOOLEAN,
ADD COLUMN "technologies" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "websiteAnalysisVersion" TEXT;

CREATE TABLE "WebsiteAnalysis" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "finalUrl" TEXT,
  "status" "JobState" NOT NULL DEFAULT 'WAITING',
  "httpStatus" INTEGER,
  "responseMs" INTEGER,
  "hasHttps" BOOLEAN,
  "sslValid" BOOLEAN,
  "hasViewport" BOOLEAN,
  "title" TEXT,
  "description" TEXT,
  "isWordPress" BOOLEAN,
  "technologies" JSONB NOT NULL DEFAULT '[]',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebsiteAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsiteAnalysis_idempotencyKey_key" ON "WebsiteAnalysis"("idempotencyKey");
CREATE UNIQUE INDEX "WebsiteAnalysis_businessId_version_key" ON "WebsiteAnalysis"("businessId", "version");
CREATE INDEX "WebsiteAnalysis_status_updatedAt_idx" ON "WebsiteAnalysis"("status", "updatedAt");
CREATE INDEX "WebsiteAnalysis_businessId_createdAt_idx" ON "WebsiteAnalysis"("businessId", "createdAt");
ALTER TABLE "WebsiteAnalysis" ADD CONSTRAINT "WebsiteAnalysis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
