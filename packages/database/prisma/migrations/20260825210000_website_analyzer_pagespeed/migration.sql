ALTER TABLE "Business"
ADD COLUMN "performanceScore" INTEGER;

ALTER TABLE "WebsiteAnalysis"
ADD COLUMN "performanceScore" INTEGER,
ADD COLUMN "pageSpeedFetchedAt" TIMESTAMP(3);
