import { prisma } from '../../db/client.js';
import { Prisma } from '@prisma/client';

function toNullableJsonInput(value: Record<string, unknown> | Prisma.InputJsonValue | null) {
  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

type SnapshotCreateRecordInput = {
  projectId: string;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  captureSource: 'EXTENSION' | 'WEB' | 'API';
  clientName?: string;
  clientVersion?: string;
  fileCount?: number;
  directoryCount?: number;
  captureMetadata?: Record<string, unknown> | Prisma.InputJsonValue;
  archiveContentType?: string;
  archiveSizeBytes?: number;
};

type SnapshotUpdateRecordInput = {
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  archiveStorageKey?: string;
  archiveContentType?: string;
  archiveSizeBytes?: number;
  integrityAlgorithm?: string;
  integrityHash?: string;
  failureCode?: string | null;
  failureReason?: string | null;
  processedAt?: Date;
  fileCount?: number;
  directoryCount?: number;
  captureMetadata?: Record<string, unknown> | Prisma.InputJsonValue;
};

type BlueprintCreateRecordInput = {
  snapshotId: string;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  projectType?: string | null;
  detectedFrameworks?: string[];
  detectedLanguages?: string[];
  importantConfigFiles?: string[];
  dependencyMetadata?: Record<string, unknown> | Prisma.InputJsonValue | null;
  entryPoints?: string[];
  detectedCommands?: string[];
  environmentReferences?: string[];
  summary?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
  processedAt?: Date | null;
  metadata?: Record<string, unknown> | Prisma.InputJsonValue | null;
};

type BlueprintUpdateRecordInput = Omit<BlueprintCreateRecordInput, 'snapshotId'>;

export class SnapshotsRepository {
  async findProjectByIdForOwner(ownerId: string, projectId: string) {
    return prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId,
      },
      select: {
        id: true,
        name: true,
      },
    });
  }

  async createSnapshot(input: SnapshotCreateRecordInput) {
    const data = {
      projectId: input.projectId,
      captureSource: input.captureSource,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.clientName !== undefined ? { clientName: input.clientName } : {}),
      ...(input.clientVersion !== undefined ? { clientVersion: input.clientVersion } : {}),
      ...(input.fileCount !== undefined ? { fileCount: input.fileCount } : {}),
      ...(input.directoryCount !== undefined ? { directoryCount: input.directoryCount } : {}),
      ...(input.captureMetadata !== undefined
        ? { captureMetadata: input.captureMetadata as Prisma.InputJsonValue }
        : {}),
      ...(input.archiveContentType !== undefined ? { archiveContentType: input.archiveContentType } : {}),
      ...(input.archiveSizeBytes !== undefined ? { archiveSizeBytes: input.archiveSizeBytes } : {}),
    };

    return prisma.snapshot.create({
      data,
    });
  }

  async findSnapshotByIdForProject(projectId: string, snapshotId: string) {
    return prisma.snapshot.findFirst({
      where: {
        id: snapshotId,
        projectId,
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
      include: {
        blueprint: true,
      },
    });
  }

  async listSnapshotsByProject(projectId: string) {
    return prisma.snapshot.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateSnapshot(projectId: string, snapshotId: string, input: SnapshotUpdateRecordInput) {
    const data = {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.archiveStorageKey !== undefined ? { archiveStorageKey: input.archiveStorageKey } : {}),
      ...(input.archiveContentType !== undefined ? { archiveContentType: input.archiveContentType } : {}),
      ...(input.archiveSizeBytes !== undefined ? { archiveSizeBytes: input.archiveSizeBytes } : {}),
      ...(input.integrityAlgorithm !== undefined ? { integrityAlgorithm: input.integrityAlgorithm } : {}),
      ...(input.integrityHash !== undefined ? { integrityHash: input.integrityHash } : {}),
      ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
      ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      ...(input.processedAt !== undefined ? { processedAt: input.processedAt } : {}),
      ...(input.fileCount !== undefined ? { fileCount: input.fileCount } : {}),
      ...(input.directoryCount !== undefined ? { directoryCount: input.directoryCount } : {}),
      ...(input.captureMetadata !== undefined
        ? { captureMetadata: input.captureMetadata as Prisma.InputJsonValue }
        : {}),
    };

    return prisma.snapshot.updateMany({
      where: {
        id: snapshotId,
        projectId,
      },
      data,
    });
  }

  async deleteSnapshot(projectId: string, snapshotId: string) {
    return prisma.snapshot.deleteMany({
      where: {
        id: snapshotId,
        projectId,
      },
    });
  }

  async deleteSnapshotWithDependencies(projectId: string, snapshotId: string) {
    return prisma.$transaction(async (tx) => {
      const snapshot = await tx.snapshot.findFirst({
        where: {
          id: snapshotId,
          projectId,
        },
        select: {
          id: true,
        },
      });

      if (!snapshot) {
        return {
          deletedCount: 0,
          blueprintsDeleted: 0,
          detectionsDeleted: 0,
          sourceSnapshotRefsCleared: 0,
          sourceDetectionRefsCleared: 0,
        };
      }

      const detections = await tx.secretDetection.findMany({
        where: {
          snapshotId,
        },
        select: {
          id: true,
        },
      });

      const sourceSnapshotRefsCleared = await tx.secret.updateMany({
        where: {
          projectId,
          sourceSnapshotId: snapshotId,
        },
        data: {
          sourceSnapshotId: null,
        },
      });

      let sourceDetectionRefsCleared = { count: 0 };
      if (detections.length > 0) {
        sourceDetectionRefsCleared = await tx.secret.updateMany({
          where: {
            projectId,
            sourceDetectionId: {
              in: detections.map((item) => item.id),
            },
          },
          data: {
            sourceDetectionId: null,
          },
        });
      }

      const blueprintsDeleted = await tx.blueprint.deleteMany({
        where: {
          snapshotId,
          snapshot: {
            projectId,
          },
        },
      });

      const detectionsDeleted = await tx.secretDetection.deleteMany({
        where: {
          snapshotId,
        },
      });

      const deleted = await tx.snapshot.deleteMany({
        where: {
          id: snapshotId,
          projectId,
        },
      });

      return {
        deletedCount: deleted.count,
        blueprintsDeleted: blueprintsDeleted.count,
        detectionsDeleted: detectionsDeleted.count,
        sourceSnapshotRefsCleared: sourceSnapshotRefsCleared.count,
        sourceDetectionRefsCleared: sourceDetectionRefsCleared.count,
      };
    });
  }

  async createBlueprint(input: BlueprintCreateRecordInput) {
    const data = {
      snapshotId: input.snapshotId,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.projectType !== undefined ? { projectType: input.projectType } : {}),
      ...(input.detectedFrameworks !== undefined ? { detectedFrameworks: input.detectedFrameworks } : {}),
      ...(input.detectedLanguages !== undefined ? { detectedLanguages: input.detectedLanguages } : {}),
      ...(input.importantConfigFiles !== undefined ? { importantConfigFiles: input.importantConfigFiles } : {}),
      ...(input.dependencyMetadata !== undefined
        ? { dependencyMetadata: toNullableJsonInput(input.dependencyMetadata) }
        : {}),
      ...(input.entryPoints !== undefined ? { entryPoints: input.entryPoints } : {}),
      ...(input.detectedCommands !== undefined ? { detectedCommands: input.detectedCommands } : {}),
      ...(input.environmentReferences !== undefined
        ? { environmentReferences: input.environmentReferences }
        : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
      ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      ...(input.processedAt !== undefined ? { processedAt: input.processedAt } : {}),
      ...(input.metadata !== undefined ? { metadata: toNullableJsonInput(input.metadata) } : {}),
    };

    return prisma.blueprint.create({ data });
  }

  async findBlueprintBySnapshotId(projectId: string, snapshotId: string) {
    return prisma.blueprint.findFirst({
      where: {
        snapshotId,
        snapshot: {
          projectId,
        },
      },
    });
  }

  async updateBlueprintBySnapshotId(snapshotId: string, input: BlueprintUpdateRecordInput) {
    const data = {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.projectType !== undefined ? { projectType: input.projectType } : {}),
      ...(input.detectedFrameworks !== undefined ? { detectedFrameworks: input.detectedFrameworks } : {}),
      ...(input.detectedLanguages !== undefined ? { detectedLanguages: input.detectedLanguages } : {}),
      ...(input.importantConfigFiles !== undefined ? { importantConfigFiles: input.importantConfigFiles } : {}),
      ...(input.dependencyMetadata !== undefined
        ? { dependencyMetadata: toNullableJsonInput(input.dependencyMetadata) }
        : {}),
      ...(input.entryPoints !== undefined ? { entryPoints: input.entryPoints } : {}),
      ...(input.detectedCommands !== undefined ? { detectedCommands: input.detectedCommands } : {}),
      ...(input.environmentReferences !== undefined
        ? { environmentReferences: input.environmentReferences }
        : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
      ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      ...(input.processedAt !== undefined ? { processedAt: input.processedAt } : {}),
      ...(input.metadata !== undefined ? { metadata: toNullableJsonInput(input.metadata) } : {}),
    };

    return prisma.blueprint.updateMany({
      where: {
        snapshotId,
      },
      data,
    });
  }

  async deleteBlueprintBySnapshotId(projectId: string, snapshotId: string) {
    return prisma.blueprint.deleteMany({
      where: {
        snapshotId,
        snapshot: {
          projectId,
        },
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
