-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SnapshotCaptureSource" AS ENUM ('EXTENSION', 'WEB', 'API');

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'PENDING',
    "captureSource" "SnapshotCaptureSource" NOT NULL DEFAULT 'API',
    "clientName" TEXT,
    "clientVersion" TEXT,
    "archiveStorageKey" TEXT,
    "archiveContentType" TEXT,
    "archiveSizeBytes" INTEGER,
    "fileCount" INTEGER,
    "directoryCount" INTEGER,
    "integrityAlgorithm" TEXT,
    "integrityHash" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "captureMetadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Snapshot_projectId_createdAt_idx" ON "Snapshot"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Snapshot_projectId_status_updatedAt_idx" ON "Snapshot"("projectId", "status", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
