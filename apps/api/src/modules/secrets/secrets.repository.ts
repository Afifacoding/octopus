import { Prisma } from '@prisma/client';

import { prisma } from '../../db/client.js';
import type { SecretCategory, SecretConfidence, SecretDetectionStatus } from './secrets.types.js';

type SecretDetectionUpsertInput = {
  snapshotId: string;
  category: SecretCategory;
  confidence: SecretConfidence;
  detectionRule: string;
  sourceFilePath: string;
  sourceLineNumber: number | null;
  maskedPreview: string;
  fingerprint: string;
  metadata?: Record<string, unknown>;
};

export class SecretsRepository {
  async findProjectByIdForOwner(ownerId: string, projectId: string) {
    return prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId,
      },
      select: {
        id: true,
      },
    });
  }

  async findSnapshotByIdForOwner(ownerId: string, projectId: string, snapshotId: string) {
    return prisma.snapshot.findFirst({
      where: {
        id: snapshotId,
        projectId,
        project: {
          ownerId,
        },
      },
    });
  }

  async listSecrets(projectId: string) {
    return prisma.secret.findMany({
      where: {
        projectId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async createSecret(input: {
    projectId: string;
    label: string;
    category: SecretCategory;
    confidence: SecretConfidence;
    maskedValue: string;
    encryptedValue: string;
    encryptionIv: string;
    encryptionAuthTag: string;
    encryptionVersion: string;
    sourceSnapshotId?: string;
    sourceDetectionId?: string;
    sourceFilePath?: string;
    sourceLineNumber?: number;
    metadata?: Record<string, unknown>;
  }) {
    const data = {
      projectId: input.projectId,
      label: input.label,
      category: input.category,
      confidence: input.confidence,
      maskedValue: input.maskedValue,
      encryptedValue: input.encryptedValue,
      encryptionIv: input.encryptionIv,
      encryptionAuthTag: input.encryptionAuthTag,
      encryptionVersion: input.encryptionVersion,
      ...(input.sourceSnapshotId !== undefined ? { sourceSnapshotId: input.sourceSnapshotId } : {}),
      ...(input.sourceDetectionId !== undefined ? { sourceDetectionId: input.sourceDetectionId } : {}),
      ...(input.sourceFilePath !== undefined ? { sourceFilePath: input.sourceFilePath } : {}),
      ...(input.sourceLineNumber !== undefined ? { sourceLineNumber: input.sourceLineNumber } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    };

    return prisma.secret.create({ data });
  }

  async findSecretByIdForProject(projectId: string, secretId: string) {
    return prisma.secret.findFirst({
      where: {
        id: secretId,
        projectId,
      },
    });
  }

  async updateSecretMaterial(projectId: string, secretId: string, input: {
    category: SecretCategory;
    confidence: SecretConfidence;
    maskedValue: string;
    encryptedValue: string;
    encryptionIv: string;
    encryptionAuthTag: string;
    encryptionVersion: string;
    sourceSnapshotId?: string;
    sourceDetectionId?: string;
    sourceFilePath?: string;
    sourceLineNumber?: number;
    metadata?: Record<string, unknown>;
  }) {
    const data = {
      category: input.category,
      confidence: input.confidence,
      maskedValue: input.maskedValue,
      encryptedValue: input.encryptedValue,
      encryptionIv: input.encryptionIv,
      encryptionAuthTag: input.encryptionAuthTag,
      encryptionVersion: input.encryptionVersion,
      ...(input.sourceSnapshotId !== undefined ? { sourceSnapshotId: input.sourceSnapshotId } : {}),
      ...(input.sourceDetectionId !== undefined ? { sourceDetectionId: input.sourceDetectionId } : {}),
      ...(input.sourceFilePath !== undefined ? { sourceFilePath: input.sourceFilePath } : {}),
      ...(input.sourceLineNumber !== undefined ? { sourceLineNumber: input.sourceLineNumber } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    };

    return prisma.secret.updateMany({
      where: {
        id: secretId,
        projectId,
      },
      data,
    });
  }

  async updateSecret(projectId: string, secretId: string, input: {
    label?: string;
    category?: SecretCategory;
    confidence?: SecretConfidence;
    metadata?: Record<string, unknown>;
    lastRevealedAt?: Date;
  }) {
    const data = {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      ...(input.lastRevealedAt !== undefined ? { lastRevealedAt: input.lastRevealedAt } : {}),
    };

    return prisma.secret.updateMany({
      where: {
        id: secretId,
        projectId,
      },
      data,
    });
  }

  async deleteSecret(projectId: string, secretId: string) {
    return prisma.secret.deleteMany({
      where: {
        id: secretId,
        projectId,
      },
    });
  }

  async countSecretsReferencingDetection(projectId: string, detectionId: string) {
    return prisma.secret.count({
      where: {
        projectId,
        sourceDetectionId: detectionId,
      },
    });
  }

  async deleteDetectionForProject(projectId: string, detectionId: string) {
    return prisma.secretDetection.deleteMany({
      where: {
        id: detectionId,
        snapshot: {
          projectId,
        },
      },
    });
  }

  async listDetectionsForSnapshot(projectId: string, snapshotId: string) {
    return prisma.secretDetection.findMany({
      where: {
        snapshotId,
        snapshot: {
          projectId,
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async findDetectionByIdForSnapshot(projectId: string, snapshotId: string, detectionId: string) {
    return prisma.secretDetection.findFirst({
      where: {
        id: detectionId,
        snapshotId,
        snapshot: {
          projectId,
        },
      },
    });
  }

  async upsertDetection(input: SecretDetectionUpsertInput) {
    const existing = await prisma.secretDetection.findUnique({
      where: {
        snapshotId_fingerprint: {
          snapshotId: input.snapshotId,
          fingerprint: input.fingerprint,
        },
      },
    });

    if (!existing) {
      return prisma.secretDetection.create({
        data: {
          snapshotId: input.snapshotId,
          category: input.category,
          confidence: input.confidence,
          detectionRule: input.detectionRule,
          sourceFilePath: input.sourceFilePath,
          sourceLineNumber: input.sourceLineNumber,
          maskedPreview: input.maskedPreview,
          fingerprint: input.fingerprint,
          ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
        },
      });
    }

    return prisma.secretDetection.update({
      where: {
        id: existing.id,
      },
      data: {
        category: input.category,
        confidence: input.confidence,
        detectionRule: input.detectionRule,
        sourceFilePath: input.sourceFilePath,
        sourceLineNumber: input.sourceLineNumber,
        maskedPreview: input.maskedPreview,
        ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async updateDetectionStatus(snapshotId: string, detectionId: string, status: SecretDetectionStatus) {
    return prisma.secretDetection.updateMany({
      where: {
        id: detectionId,
        snapshotId,
      },
      data: {
        status,
      },
    });
  }

  async createAuditLog(input: {
    userId?: string;
    action: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const data = {
      action: input.action,
      ...(typeof input.userId === 'string' ? { userId: input.userId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    await prisma.auditLog.create({ data });
  }
}
