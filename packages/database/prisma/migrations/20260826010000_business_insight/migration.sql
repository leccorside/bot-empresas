CREATE TABLE "BusinessInsight" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "suggestedPitch" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessInsight_businessId_key" ON "BusinessInsight"("businessId");
ALTER TABLE "BusinessInsight" ADD CONSTRAINT "BusinessInsight_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
