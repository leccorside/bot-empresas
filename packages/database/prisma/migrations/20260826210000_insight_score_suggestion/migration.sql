ALTER TABLE "BusinessInsight" ADD COLUMN "suggestedScore" INTEGER;
ALTER TABLE "BusinessInsight" ADD COLUMN "scoreJustification" TEXT;
ALTER TABLE "BusinessInsight" ADD COLUMN "scoreApplied" BOOLEAN NOT NULL DEFAULT false;
