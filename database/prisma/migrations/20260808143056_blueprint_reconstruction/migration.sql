-- CreateEnum
CREATE TYPE "BlueprintStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "status" "BlueprintStatus" NOT NULL DEFAULT 'PENDING',
    "projectType" TEXT,
    "detectedFrameworks" JSONB,
    "detectedLanguages" JSONB,
    "importantConfigFiles" JSONB,
    "dependencyMetadata" JSONB,
    "entryPoints" JSONB,
    "detectedCommands" JSONB,
    "environmentReferences" JSONB,
    "summary" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Blueprint_snapshotId_key" ON "Blueprint"("snapshotId");

-- CreateIndex
CREATE INDEX "Blueprint_status_updatedAt_idx" ON "Blueprint"("status", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "Blueprint" ADD CONSTRAINT "Blueprint_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
