CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');
CREATE TYPE "ExportStatus" AS ENUM ('CREATING', 'COMPLETED', 'FAILED');

CREATE TABLE "ExportRecord" (
    "id" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'CREATING',
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExportRecord_filename_key" ON "ExportRecord"("filename");
CREATE INDEX "ExportRecord_createdAt_idx" ON "ExportRecord"("createdAt");
CREATE INDEX "ExportRecord_status_idx" ON "ExportRecord"("status");
