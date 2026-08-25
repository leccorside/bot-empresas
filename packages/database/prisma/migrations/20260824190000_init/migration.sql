-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'PAUSED', 'RECOVERING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CellStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckpointStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('NO_WEBSITE', 'POOR', 'AVERAGE', 'GOOD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsappStatus" AS ENUM ('UNKNOWN', 'AVAILABLE', 'NOT_AVAILABLE', 'INVALID');

-- CreateEnum
CREATE TYPE "PhoneType" AS ENUM ('MOBILE', 'LANDLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ScoreClass" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACT_PENDING', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'PROPOSAL', 'CUSTOMER', 'NOT_INTERESTED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'SPECIFIC_DAYS', 'CRON');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'RECOVERING', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Administrador',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "country" TEXT NOT NULL DEFAULT 'Brasil',
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Todos',
    "scheduleType" "ScheduleType" NOT NULL,
    "cronExpression" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectingRun" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT,
    "country" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "businessesFound" INTEGER NOT NULL DEFAULT 0,
    "businessesNew" INTEGER NOT NULL DEFAULT 0,
    "businessesUpdated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesFound" INTEGER NOT NULL DEFAULT 0,
    "websitesFound" INTEGER NOT NULL DEFAULT 0,
    "withoutWebsite" INTEGER NOT NULL DEFAULT 0,
    "phonesFound" INTEGER NOT NULL DEFAULT 0,
    "whatsappFound" INTEGER NOT NULL DEFAULT 0,
    "currentStage" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchCell" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius" INTEGER NOT NULL DEFAULT 5000,
    "category" TEXT NOT NULL,
    "status" "CellStatus" NOT NULL DEFAULT 'PENDING',
    "currentPage" INTEGER NOT NULL DEFAULT 0,
    "nextPageToken" TEXT,
    "resultsFound" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SearchCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingCheckpoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "cursor" TEXT,
    "page" INTEGER NOT NULL DEFAULT 0,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "totalItems" INTEGER,
    "status" "CheckpointStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessingCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "normalizedAddress" TEXT,
    "district" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Brasil',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "website" TEXT,
    "siteStatus" "SiteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "siteHttpStatus" INTEGER,
    "siteResponseMs" INTEGER,
    "hasHttps" BOOLEAN,
    "pageTitle" TEXT,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "mapsUrl" TEXT,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "scoreClass" "ScoreClass" NOT NULL DEFAULT 'LOW',
    "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "websiteCheckedAt" TIMESTAMP(3),
    "phoneCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPhone" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "type" "PhoneType" NOT NULL DEFAULT 'UNKNOWN',
    "whatsappStatus" "WhatsappStatus" NOT NULL DEFAULT 'UNKNOWN',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "website" TEXT,
    "phone" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cellId" TEXT,
    "wasNew" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromStatus" "LeadStatus",
    "toStatus" "LeadStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "messageTemplate" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactSuppression" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "normalizedPhone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRecord" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bullJobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'WAITING',
    "runId" TEXT,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "errorMessage" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Schedule_enabled_nextRunAt_idx" ON "Schedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectingRun_idempotencyKey_key" ON "ProspectingRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProspectingRun_status_heartbeatAt_idx" ON "ProspectingRun"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "ProspectingRun_createdAt_idx" ON "ProspectingRun"("createdAt");

-- CreateIndex
CREATE INDEX "SearchCell_runId_status_idx" ON "SearchCell"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SearchCell_runId_latitude_longitude_category_key" ON "SearchCell"("runId", "latitude", "longitude", "category");

-- CreateIndex
CREATE INDEX "ProcessingCheckpoint_runId_status_idx" ON "ProcessingCheckpoint"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingCheckpoint_runId_stage_entityType_entityId_key" ON "ProcessingCheckpoint"("runId", "stage", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Business_city_state_category_idx" ON "Business"("city", "state", "category");

-- CreateIndex
CREATE INDEX "Business_leadScore_leadStatus_idx" ON "Business"("leadScore", "leadStatus");

-- CreateIndex
CREATE INDEX "Business_normalizedName_normalizedPhone_normalizedAddress_idx" ON "Business"("normalizedName", "normalizedPhone", "normalizedAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Business_provider_providerId_key" ON "Business"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessPhone_normalizedPhone_key" ON "BusinessPhone"("normalizedPhone");

-- CreateIndex
CREATE INDEX "BusinessSnapshot_businessId_capturedAt_idx" ON "BusinessSnapshot"("businessId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryEvent_runId_businessId_key" ON "DiscoveryEvent"("runId", "businessId");

-- CreateIndex
CREATE INDEX "LeadEvent_businessId_createdAt_idx" ON "LeadEvent"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMessage_idempotencyKey_key" ON "CampaignMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CampaignMessage_status_scheduledAt_idx" ON "CampaignMessage"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMessage_campaignId_businessId_key" ON "CampaignMessage"("campaignId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactSuppression_normalizedPhone_key" ON "ContactSuppression"("normalizedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "JobRecord_bullJobId_key" ON "JobRecord"("bullJobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRecord_idempotencyKey_key" ON "JobRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobRecord_state_availableAt_idx" ON "JobRecord"("state", "availableAt");

-- AddForeignKey
ALTER TABLE "ProspectingRun" ADD CONSTRAINT "ProspectingRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCell" ADD CONSTRAINT "SearchCell_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProspectingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingCheckpoint" ADD CONSTRAINT "ProcessingCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProspectingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPhone" ADD CONSTRAINT "BusinessPhone_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSnapshot" ADD CONSTRAINT "BusinessSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryEvent" ADD CONSTRAINT "DiscoveryEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProspectingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryEvent" ADD CONSTRAINT "DiscoveryEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSuppression" ADD CONSTRAINT "ContactSuppression_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecord" ADD CONSTRAINT "JobRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProspectingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
