CREATE TABLE "AutopilotTarget" (
  "id" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'Brasil',
  "state" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Todos',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastDispatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutopilotTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutopilotTarget_country_state_city_category_key" ON "AutopilotTarget"("country", "state", "city", "category");
CREATE INDEX "AutopilotTarget_enabled_lastDispatchedAt_idx" ON "AutopilotTarget"("enabled", "lastDispatchedAt");

ALTER TABLE "ProspectingRun" ADD COLUMN "autopilotTargetId" TEXT;
ALTER TABLE "ProspectingRun" ADD CONSTRAINT "ProspectingRun_autopilotTargetId_fkey" FOREIGN KEY ("autopilotTargetId") REFERENCES "AutopilotTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
