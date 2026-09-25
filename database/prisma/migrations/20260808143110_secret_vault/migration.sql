-- CreateEnum
CREATE TYPE "SecretCategory" AS ENUM (
  'API_KEY',
  'ACCESS_TOKEN',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'DATABASE_URL',
  'JWT',
  'OAUTH_CLIENT_SECRET',
  'CLOUD_CREDENTIAL',
  'WEBHOOK_SECRET',
  'PASSWORD',
  'GENERIC_SECRET'
);

-- CreateEnum
CREATE TYPE "SecretConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SecretDetectionStatus" AS ENUM ('OPEN', 'IGNORED', 'IMPORTED');

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceSnapshotId" TEXT,
    "sourceDetectionId" TEXT,
    "label" TEXT NOT NULL,
    "category" "SecretCategory" NOT NULL,
    "confidence" "SecretConfidence" NOT NULL,
    "maskedValue" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "encryptionAuthTag" TEXT NOT NULL,
    "encryptionVersion" TEXT NOT NULL DEFAULT 'v1',
    "sourceFilePath" TEXT,
    "sourceLineNumber" INTEGER,
    "metadata" JSONB,
    "lastRevealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretDetection" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "category" "SecretCategory" NOT NULL,
    "confidence" "SecretConfidence" NOT NULL,
    "status" "SecretDetectionStatus" NOT NULL DEFAULT 'OPEN',
    "detectionRule" TEXT NOT NULL,
    "sourceFilePath" TEXT NOT NULL,
    "sourceLineNumber" INTEGER,
    "maskedPreview" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecretDetection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Secret_projectId_category_updatedAt_idx" ON "Secret"("projectId", "category", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SecretDetection_snapshotId_fingerprint_key" ON "SecretDetection"("snapshotId", "fingerprint");

-- CreateIndex
CREATE INDEX "SecretDetection_snapshotId_status_updatedAt_idx" ON "SecretDetection"("snapshotId", "status", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "Snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_sourceDetectionId_fkey" FOREIGN KEY ("sourceDetectionId") REFERENCES "SecretDetection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretDetection" ADD CONSTRAINT "SecretDetection_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
