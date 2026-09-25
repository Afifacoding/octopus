import { env } from '../../config/env.js';
import { HttpError } from '../../core/errors/http-error.js';
import { createSnapshotStorage, type SnapshotStorage } from '../snapshots/snapshots.storage.js';
import { decryptSecretValue, encryptSecretValue, maskSecretValue } from './secrets.crypto.js';
import { detectSecretsFromArchive } from './secrets.detection.js';
import { canAutoImportToVault, canExposeThroughVault } from './secrets.protection-policy.js';
import { SecretsRepository } from './secrets.repository.js';
import type {
  DetectionProcessResult,
  SecretCreateInput,
  SecretDetectionRecord,
  SecretRecord,
  SecretUpdateInput,
} from './secrets.types.js';

type SecretDbRecord = {
  id: string;
  projectId: string;
  sourceSnapshotId: string | null;
  sourceDetectionId: string | null;
  label: string;
  category:
    | 'API_KEY'
    | 'ACCESS_TOKEN'
    | 'SECRET_KEY'
    | 'PRIVATE_KEY'
    | 'DATABASE_URL'
    | 'JWT'
    | 'OAUTH_CLIENT_SECRET'
    | 'CLOUD_CREDENTIAL'
    | 'WEBHOOK_SECRET'
    | 'PASSWORD'
    | 'GENERIC_SECRET';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  maskedValue: string;
  encryptedValue: string;
  encryptionIv: string;
  encryptionAuthTag: string;
  sourceFilePath: string | null;
  sourceLineNumber: number | null;
  metadata: unknown;
  encryptionVersion: string;
  lastRevealedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SecretDetectionDbRecord = {
  id: string;
  snapshotId: string;
  category: SecretDbRecord['category'];
  confidence: SecretDbRecord['confidence'];
  status: 'OPEN' | 'IGNORED' | 'IMPORTED';
  detectionRule: string;
  sourceFilePath: string;
  sourceLineNumber: number | null;
  maskedPreview: string;
  fingerprint: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type AutoImportResult = {
  snapshotId: string;
  detectionsCount: number;
  createdCount: number;
  updatedCount: number;
};

export class SecretsService {
  private readonly storage: SnapshotStorage;

  constructor(private readonly repository: SecretsRepository, storage?: SnapshotStorage) {
    this.storage = storage ?? createSnapshotStorage();
  }

  async listSecrets(ownerId: string, projectId: string) {
    await this.assertProjectOwnership(ownerId, projectId);
    await this.cleanupInvalidAutoImportedSecrets(ownerId, projectId);
    const records = await this.repository.listSecrets(projectId);
    return records
      .filter((record) => canExposeThroughVault({ label: record.label }))
      .map((record) => this.toPublicSecret(record));
  }

  async assertProjectAccess(ownerId: string, projectId: string) {
    await this.assertProjectOwnership(ownerId, projectId);
  }

  async auditVaultUnlocked(ownerId: string, projectId: string) {
    await this.assertProjectOwnership(ownerId, projectId);
    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'VAULT_UNLOCKED',
      metadata: {
        projectId,
      },
    });
  }

  async auditVaultUnlockFailed(ownerId: string, projectId: string) {
    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'VAULT_UNLOCK_FAILED',
      metadata: {
        projectId,
      },
    });
  }

  async auditVaultLocked(ownerId: string, projectId: string) {
    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'VAULT_LOCKED',
      metadata: {
        projectId,
      },
    });
  }

  async createSecret(ownerId: string, projectId: string, input: SecretCreateInput) {
    await this.assertProjectOwnership(ownerId, projectId);

    if (!canExposeThroughVault({ label: input.label })) {
      throw new HttpError(403, 'INTERNAL_SECRET_PROTECTED', 'Internal system secrets cannot be stored in user vault');
    }

    const value = input.value ?? (await this.resolveDetectionValue(ownerId, projectId, input));
    const encrypted = encryptSecretValue(value);

    const record = await this.repository.createSecret({
      projectId,
      label: input.label,
      category: input.category,
      confidence: input.confidence,
      maskedValue: maskSecretValue(value),
      encryptedValue: encrypted.encryptedValue,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      encryptionVersion: encrypted.encryptionVersion,
      ...(input.sourceSnapshotId !== undefined ? { sourceSnapshotId: input.sourceSnapshotId } : {}),
      ...(input.sourceDetectionId !== undefined ? { sourceDetectionId: input.sourceDetectionId } : {}),
      ...(input.sourceFilePath !== undefined ? { sourceFilePath: input.sourceFilePath } : {}),
      ...(input.sourceLineNumber !== undefined ? { sourceLineNumber: input.sourceLineNumber } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });

    if (input.sourceSnapshotId && input.sourceDetectionId) {
      await this.repository.updateDetectionStatus(input.sourceSnapshotId, input.sourceDetectionId, 'IMPORTED');
      await this.repository.createAuditLog({
        userId: ownerId,
        action: 'SECRET_DETECTION_IMPORTED_TO_VAULT',
        metadata: {
          projectId,
          sourceSnapshotId: input.sourceSnapshotId,
          sourceDetectionId: input.sourceDetectionId,
          category: input.category,
        },
      });
    }

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SECRET_CREATED',
      metadata: {
        projectId,
        secretId: record.id,
        category: record.category,
      },
    });

    return this.toPublicSecret(record);
  }

  async getSecret(ownerId: string, projectId: string, secretId: string) {
    const secret = await this.findAuthorizedSecret(ownerId, projectId, secretId);
    return this.toPublicSecret(secret);
  }

  async revealSecret(ownerId: string, projectId: string, secretId: string) {
    const secret = await this.findAuthorizedSecret(ownerId, projectId, secretId);

    const plaintext = decryptSecretValue({
      encryptedValue: secret.encryptedValue,
      iv: secret.encryptionIv,
      authTag: secret.encryptionAuthTag,
    });

    await this.repository.updateSecret(projectId, secretId, {
      lastRevealedAt: new Date(),
    });

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SECRET_REVEALED',
      metadata: {
        projectId,
        secretId,
        category: secret.category,
      },
    });

    return {
      secretId,
      value: plaintext,
      revealedAt: new Date().toISOString(),
    };
  }

  async auditSecretCopied(ownerId: string, projectId: string, secretId: string) {
    const secret = await this.findAuthorizedSecret(ownerId, projectId, secretId);

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SECRET_COPIED',
      metadata: {
        projectId,
        secretId,
        category: secret.category,
      },
    });

    return { secretId, copied: true } as const;
  }

  async auditSecretHidden(ownerId: string, projectId: string, secretId: string) {
    const secret = await this.findAuthorizedSecret(ownerId, projectId, secretId);

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SECRET_HIDDEN',
      metadata: {
        projectId,
        secretId,
        category: secret.category,
      },
    });

    return { secretId, hidden: true } as const;
  }

  async updateSecret(ownerId: string, projectId: string, secretId: string, input: SecretUpdateInput) {
    await this.findAuthorizedSecret(ownerId, projectId, secretId);

    if (input.label !== undefined && !canExposeThroughVault({ label: input.label })) {
      throw new HttpError(403, 'INTERNAL_SECRET_PROTECTED', 'Internal system secrets cannot be stored in user vault');
    }

    const result = await this.repository.updateSecret(projectId, secretId, {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });

    if (result.count === 0) {
      throw new HttpError(404, 'SECRET_NOT_FOUND', 'Secret not found');
    }

    const updated = await this.repository.findSecretByIdForProject(projectId, secretId);
    if (!updated) {
      throw new HttpError(404, 'SECRET_NOT_FOUND', 'Secret not found');
    }

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SECRET_EDITED',
      metadata: {
        projectId,
        secretId,
      },
    });

    return this.toPublicSecret(updated);
  }

  async deleteSecret(ownerId: string, projectId: string, secretId: string) {
    const secret = await this.findAuthorizedSecret(ownerId, projectId, secretId);

    const result = await this.repository.deleteSecret(projectId, secretId);

    if (result.count === 0) {
      throw new HttpError(404, 'SECRET_NOT_FOUND', 'Secret not found');
    }

    const detectionId = typeof secret.sourceDetectionId === 'string' ? secret.sourceDetectionId : null;
    let deletedDetectionId: string | null = null;

    if (detectionId) {
      // Only drop the detection once no other vault entry in this project still sources it.
      const remainingReferences = await this.repository.countSecretsReferencingDetection(projectId, detectionId);

      if (remainingReferences === 0) {
        const detectionResult = await this.repository.deleteDetectionForProject(projectId, detectionId);
        if (detectionResult.count > 0) {
          deletedDetectionId = detectionId;
        }
      }
    }

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SECRET_DELETED',
      metadata: {
        projectId,
        secretId,
        ...(deletedDetectionId ? { deletedDetectionId } : {}),
      },
    });

    return {
      secretId,
      deleted: true,
      ...(deletedDetectionId ? { deletedDetectionId } : {}),
    };
  }

  async processSnapshotDetections(ownerId: string, projectId: string, snapshotId: string): Promise<DetectionProcessResult> {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    if (!snapshot.archiveStorageKey) {
      throw new HttpError(400, 'SNAPSHOT_ARCHIVE_MISSING', 'Snapshot archive is missing');
    }

    const archiveBuffer = await this.storage.readArchive(snapshot.archiveStorageKey);
    const detections = await detectSecretsFromArchive({
      archiveBuffer,
      maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
    });

    for (const detection of detections) {
      await this.repository.upsertDetection({
        snapshotId,
        category: detection.category,
        confidence: detection.confidence,
        detectionRule: detection.detectionRule,
        sourceFilePath: detection.sourceFilePath,
        sourceLineNumber: detection.sourceLineNumber,
        maskedPreview: detection.maskedPreview,
        fingerprint: detection.fingerprint,
        metadata: detection.metadata,
      });
    }

    const persisted = await this.repository.listDetectionsForSnapshot(projectId, snapshotId);

    return {
      snapshotId,
      detections: persisted.map((item) => this.toPublicDetection(item)),
    };
  }

  async autoImportSnapshotSecrets(
    ownerId: string,
    projectId: string,
    snapshotId: string,
    archiveBufferOverride?: Buffer,
  ): Promise<AutoImportResult> {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    if (!snapshot.archiveStorageKey && !archiveBufferOverride) {
      throw new HttpError(400, 'SNAPSHOT_ARCHIVE_MISSING', 'Snapshot archive is missing');
    }

    const archiveBuffer =
      archiveBufferOverride ?? (await this.storage.readArchive(snapshot.archiveStorageKey as string));

    const rawDetections = await detectSecretsFromArchive({
      archiveBuffer,
      maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
    });

    for (const detection of rawDetections) {
      await this.repository.upsertDetection({
        snapshotId,
        category: detection.category,
        confidence: detection.confidence,
        detectionRule: detection.detectionRule,
        sourceFilePath: detection.sourceFilePath,
        sourceLineNumber: detection.sourceLineNumber,
        maskedPreview: detection.maskedPreview,
        fingerprint: detection.fingerprint,
        metadata: detection.metadata,
      });
    }

    await this.cleanupInvalidAutoImportedSecrets(ownerId, projectId);

    const persistedDetections = await this.repository.listDetectionsForSnapshot(projectId, snapshotId);
    const detectionsByFingerprint = new Map(persistedDetections.map((item) => [item.fingerprint, item]));
    const existingSecrets = await this.repository.listSecrets(projectId);
    const existingByLabel = new Map(existingSecrets.map((item) => [item.label, item]));

    let createdCount = 0;
    let updatedCount = 0;

    for (const rawDetection of rawDetections) {
      const detection = detectionsByFingerprint.get(rawDetection.fingerprint);
      if (!detection) {
        continue;
      }

      const label = this.resolveAutoSecretLabel(rawDetection, detection);
      if (!label) {
        continue;
      }

      if (
        !canAutoImportToVault({
          key: label,
          value: rawDetection.rawValue,
          sourceFilePath: rawDetection.sourceFilePath,
        })
      ) {
        continue;
      }

      const encrypted = encryptSecretValue(rawDetection.rawValue);
      const nextMetadata = this.buildAutoSecretMetadata(detection);
      const existing = existingByLabel.get(label);

      if (!existing) {
        const created = await this.repository.createSecret({
          projectId,
          label,
          category: detection.category,
          confidence: detection.confidence,
          maskedValue: maskSecretValue(rawDetection.rawValue),
          encryptedValue: encrypted.encryptedValue,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          encryptionVersion: encrypted.encryptionVersion,
          sourceSnapshotId: snapshotId,
          sourceDetectionId: detection.id,
          sourceFilePath: detection.sourceFilePath,
          ...(detection.sourceLineNumber !== null ? { sourceLineNumber: detection.sourceLineNumber } : {}),
          metadata: nextMetadata,
        });

        existingByLabel.set(label, created);
        createdCount += 1;
      } else {
        await this.repository.updateSecretMaterial(projectId, existing.id, {
          category: detection.category,
          confidence: detection.confidence,
          maskedValue: maskSecretValue(rawDetection.rawValue),
          encryptedValue: encrypted.encryptedValue,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          encryptionVersion: encrypted.encryptionVersion,
          sourceSnapshotId: snapshotId,
          sourceDetectionId: detection.id,
          sourceFilePath: detection.sourceFilePath,
          ...(detection.sourceLineNumber !== null ? { sourceLineNumber: detection.sourceLineNumber } : {}),
          metadata: this.mergeSecretMetadata(existing.metadata, nextMetadata),
        });

        const refreshed = await this.repository.findSecretByIdForProject(projectId, existing.id);
        if (refreshed) {
          existingByLabel.set(label, refreshed);
        }
        updatedCount += 1;
      }

      if (detection.status !== 'IMPORTED') {
        await this.repository.updateDetectionStatus(snapshotId, detection.id, 'IMPORTED');
      }
    }

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SNAPSHOT_SECRETS_AUTO_IMPORTED',
      metadata: {
        projectId,
        snapshotId,
        detectionsCount: rawDetections.length,
        createdCount,
        updatedCount,
      },
    });

    return {
      snapshotId,
      detectionsCount: rawDetections.length,
      createdCount,
      updatedCount,
    };
  }

  async listSnapshotDetections(ownerId: string, projectId: string, snapshotId: string): Promise<DetectionProcessResult> {
    await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);
    const detections = await this.repository.listDetectionsForSnapshot(projectId, snapshotId);

    return {
      snapshotId,
      detections: detections.map((item) => this.toPublicDetection(item)),
    };
  }

  async updateDetectionStatus(
    ownerId: string,
    projectId: string,
    snapshotId: string,
    detectionId: string,
    status: 'OPEN' | 'IGNORED',
  ) {
    await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    const detection = await this.repository.findDetectionByIdForSnapshot(projectId, snapshotId, detectionId);
    if (!detection) {
      throw new HttpError(404, 'SECRET_DETECTION_NOT_FOUND', 'Secret detection not found');
    }

    await this.repository.updateDetectionStatus(snapshotId, detectionId, status);

    await this.repository.createAuditLog({
      userId: ownerId,
      action: status === 'IGNORED' ? 'SECRET_DETECTION_IGNORED' : 'SECRET_DETECTION_REOPENED',
      metadata: {
        projectId,
        snapshotId,
        detectionId,
      },
    });

    const updated = await this.repository.findDetectionByIdForSnapshot(projectId, snapshotId, detectionId);
    if (!updated) {
      throw new HttpError(404, 'SECRET_DETECTION_NOT_FOUND', 'Secret detection not found');
    }

    return this.toPublicDetection(updated);
  }

  private async resolveDetectionValue(ownerId: string, projectId: string, input: SecretCreateInput) {
    if (!input.sourceSnapshotId || !input.sourceDetectionId) {
      throw new HttpError(400, 'SECRET_VALUE_REQUIRED', 'Secret value is required');
    }

    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, input.sourceSnapshotId);
    if (!snapshot.archiveStorageKey) {
      throw new HttpError(400, 'SNAPSHOT_ARCHIVE_MISSING', 'Snapshot archive is missing');
    }

    const detection = await this.repository.findDetectionByIdForSnapshot(projectId, input.sourceSnapshotId, input.sourceDetectionId);
    if (!detection) {
      throw new HttpError(404, 'SECRET_DETECTION_NOT_FOUND', 'Secret detection not found');
    }

    const archiveBuffer = await this.storage.readArchive(snapshot.archiveStorageKey);
    const rawDetections = await detectSecretsFromArchive({
      archiveBuffer,
      maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
    });

    const match = rawDetections.find((item) => item.fingerprint === detection.fingerprint);
    if (!match) {
      throw new HttpError(409, 'SECRET_DETECTION_STALE', 'Detection could not be resolved from snapshot data');
    }

    return match.rawValue;
  }

  private async assertProjectOwnership(ownerId: string, projectId: string) {
    const project = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }
  }

  private async findAuthorizedSnapshot(ownerId: string, projectId: string, snapshotId: string) {
    const snapshot = await this.repository.findSnapshotByIdForOwner(ownerId, projectId, snapshotId);
    if (!snapshot) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    return snapshot;
  }

  private async findAuthorizedSecret(ownerId: string, projectId: string, secretId: string) {
    await this.assertProjectOwnership(ownerId, projectId);

    const secret = await this.repository.findSecretByIdForProject(projectId, secretId);
    if (!secret) {
      throw new HttpError(404, 'SECRET_NOT_FOUND', 'Secret not found');
    }

    if (!canExposeThroughVault({ label: secret.label })) {
      throw new HttpError(404, 'SECRET_NOT_FOUND', 'Secret not found');
    }

    return secret;
  }

  private parseMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private mergeSecretMetadata(current: unknown, updates: Record<string, unknown>) {
    const existing = this.parseMetadata(current) ?? {};
    return {
      ...existing,
      ...updates,
    };
  }

  private resolveAutoSecretLabel(
    rawDetection: {
      category: SecretDbRecord['category'];
      sourceFilePath: string;
      sourceLineNumber: number | null;
      metadata: Record<string, unknown>;
    },
    persistedDetection: SecretDetectionDbRecord,
  ) {
    if (!this.isEligibleAutoImportSourcePath(rawDetection.sourceFilePath)) {
      return null;
    }

    const candidate = rawDetection.metadata.secretLabel;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }

    const fallbackCandidate = persistedDetection.metadata as { secretLabel?: unknown } | null;
    if (fallbackCandidate && typeof fallbackCandidate.secretLabel === 'string' && fallbackCandidate.secretLabel.trim().length > 0) {
      return fallbackCandidate.secretLabel.trim();
    }

    return null;
  }

  private buildAutoSecretMetadata(detection: SecretDetectionDbRecord): Record<string, unknown> {
    return {
      source: 'snapshot-auto-detection',
      detectedAt: new Date().toISOString(),
      snapshotId: detection.snapshotId,
      detectionId: detection.id,
      detectionRule: detection.detectionRule,
      detectionCategory: detection.category,
      detectionConfidence: detection.confidence,
      sourceFilePath: detection.sourceFilePath,
      ...(detection.sourceLineNumber !== null ? { sourceLineNumber: detection.sourceLineNumber } : {}),
    };
  }

  private isEligibleAutoImportSourcePath(sourceFilePath: string) {
    const normalized = sourceFilePath.replace(/\\/g, '/').toLowerCase();
    const segments = normalized.split('/').filter(Boolean);
    const baseName = segments[segments.length - 1] ?? '';

    const isEnvFile = baseName === '.env' || baseName.startsWith('.env.');
    if (!isEnvFile) {
      return false;
    }

    return true;
  }

  private async cleanupInvalidAutoImportedSecrets(ownerId: string, projectId: string) {
    const secrets = await this.repository.listSecrets(projectId);
    let removedCount = 0;

    for (const secret of secrets) {
      const metadata = this.parseMetadata(secret.metadata);
      const isAutoImported = metadata?.source === 'snapshot-auto-detection';

      if (!isAutoImported) {
        continue;
      }

      const sourceFilePath = typeof secret.sourceFilePath === 'string' ? secret.sourceFilePath : '';
      if (this.isEligibleAutoImportSourcePath(sourceFilePath) && canExposeThroughVault({ label: secret.label })) {
        continue;
      }

      const result = await this.repository.deleteSecret(projectId, secret.id);
      if (result.count > 0) {
        removedCount += 1;
      }
    }

    if (removedCount > 0) {
      await this.repository.createAuditLog({
        userId: ownerId,
        action: 'SECRET_VAULT_AUTO_CLEANUP_REMOVED',
        metadata: {
          projectId,
          removedCount,
        },
      });
    }
  }

  private toPublicSecret(secret: SecretDbRecord): SecretRecord {
    return {
      id: secret.id,
      projectId: secret.projectId,
      sourceSnapshotId: secret.sourceSnapshotId,
      sourceDetectionId: secret.sourceDetectionId,
      label: secret.label,
      category: secret.category,
      confidence: secret.confidence,
      maskedValue: secret.maskedValue,
      sourceFilePath: secret.sourceFilePath,
      sourceLineNumber: secret.sourceLineNumber,
      metadata: this.parseMetadata(secret.metadata),
      lastRevealedAt: secret.lastRevealedAt ? secret.lastRevealedAt.toISOString() : null,
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
    };
  }

  private toPublicDetection(detection: SecretDetectionDbRecord): SecretDetectionRecord {
    return {
      id: detection.id,
      snapshotId: detection.snapshotId,
      category: detection.category,
      confidence: detection.confidence,
      status: detection.status,
      detectionRule: detection.detectionRule,
      sourceFilePath: detection.sourceFilePath,
      sourceLineNumber: detection.sourceLineNumber,
      maskedPreview: detection.maskedPreview,
      fingerprint: detection.fingerprint,
      metadata: this.parseMetadata(detection.metadata),
      createdAt: detection.createdAt.toISOString(),
      updatedAt: detection.updatedAt.toISOString(),
    };
  }
}
