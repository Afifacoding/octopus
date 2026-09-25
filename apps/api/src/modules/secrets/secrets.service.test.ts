import { describe, expect, it, beforeEach } from 'vitest';
import yazl from 'yazl';

import { HttpError } from '../../core/errors/http-error.js';
import type { SnapshotStorage } from '../snapshots/snapshots.storage.js';
import { SecretsService } from './secrets.service.js';

async function createZipBuffer(entries: Array<{ path: string; content: string }>) {
  const zipFile = new yazl.ZipFile();

  for (const entry of entries) {
    zipFile.addBuffer(Buffer.from(entry.content), entry.path);
  }

  zipFile.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zipFile.outputStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

type SecretRecord = {
  id: string;
  projectId: string;
  sourceSnapshotId: string | null;
  sourceDetectionId: string | null;
  label: string;
  category: 'API_KEY' | 'ACCESS_TOKEN' | 'SECRET_KEY' | 'PRIVATE_KEY' | 'DATABASE_URL' | 'JWT' | 'OAUTH_CLIENT_SECRET' | 'CLOUD_CREDENTIAL' | 'WEBHOOK_SECRET' | 'PASSWORD' | 'GENERIC_SECRET';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  maskedValue: string;
  encryptedValue: string;
  encryptionIv: string;
  encryptionAuthTag: string;
  sourceFilePath: string | null;
  sourceLineNumber: number | null;
  metadata: Record<string, unknown> | null;
  lastRevealedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DetectionRecord = {
  id: string;
  snapshotId: string;
  category: SecretRecord['category'];
  confidence: SecretRecord['confidence'];
  status: 'OPEN' | 'IGNORED' | 'IMPORTED';
  detectionRule: string;
  sourceFilePath: string;
  sourceLineNumber: number | null;
  maskedPreview: string;
  fingerprint: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

class FakeSecretsRepository {
  projectsByOwner = new Map<string, Set<string>>();
  snapshots: Array<{ id: string; projectId: string; ownerId: string; archiveStorageKey: string | null }> = [];
  secrets: SecretRecord[] = [];
  detections: DetectionRecord[] = [];
  auditLogs: Array<{ userId?: string; action: string; metadata?: unknown }> = [];

  addProject(ownerId: string, projectId: string) {
    const current = this.projectsByOwner.get(ownerId) ?? new Set<string>();
    current.add(projectId);
    this.projectsByOwner.set(ownerId, current);
  }

  addSnapshot(ownerId: string, projectId: string, snapshotId: string, archiveStorageKey: string) {
    this.snapshots.push({ id: snapshotId, projectId, ownerId, archiveStorageKey });
  }

  async findProjectByIdForOwner(ownerId: string, projectId: string) {
    const ids = this.projectsByOwner.get(ownerId);
    if (!ids?.has(projectId)) {
      return null;
    }

    return { id: projectId };
  }

  async findSnapshotByIdForOwner(ownerId: string, projectId: string, snapshotId: string) {
    return (
      this.snapshots.find(
        (snapshot) =>
          snapshot.id === snapshotId && snapshot.projectId === projectId && snapshot.ownerId === ownerId,
      ) ?? null
    );
  }

  async listSecrets(projectId: string) {
    return this.secrets.filter((secret) => secret.projectId === projectId);
  }

  async createSecret(input: {
    projectId: string;
    label: string;
    category: SecretRecord['category'];
    confidence: SecretRecord['confidence'];
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
    const record: SecretRecord = {
      id: `secret_${this.secrets.length + 1}`,
      projectId: input.projectId,
      sourceSnapshotId: input.sourceSnapshotId ?? null,
      sourceDetectionId: input.sourceDetectionId ?? null,
      label: input.label,
      category: input.category,
      confidence: input.confidence,
      maskedValue: input.maskedValue,
      encryptedValue: input.encryptedValue,
      encryptionIv: input.encryptionIv,
      encryptionAuthTag: input.encryptionAuthTag,
      sourceFilePath: input.sourceFilePath ?? null,
      sourceLineNumber: input.sourceLineNumber ?? null,
      metadata: input.metadata ?? null,
      lastRevealedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.secrets.push(record);
    return record;
  }

  async findSecretByIdForProject(projectId: string, secretId: string) {
    return this.secrets.find((secret) => secret.projectId === projectId && secret.id === secretId) ?? null;
  }

  async updateSecretMaterial(projectId: string, secretId: string, input: {
    category: SecretRecord['category'];
    confidence: SecretRecord['confidence'];
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
    const secret = this.secrets.find((item) => item.projectId === projectId && item.id === secretId);
    if (!secret) {
      return { count: 0 };
    }

    secret.category = input.category;
    secret.confidence = input.confidence;
    secret.maskedValue = input.maskedValue;
    secret.encryptedValue = input.encryptedValue;
    secret.encryptionIv = input.encryptionIv;
    secret.encryptionAuthTag = input.encryptionAuthTag;
    secret.sourceSnapshotId = input.sourceSnapshotId ?? null;
    secret.sourceDetectionId = input.sourceDetectionId ?? null;
    secret.sourceFilePath = input.sourceFilePath ?? null;
    secret.sourceLineNumber = input.sourceLineNumber ?? null;
    secret.metadata = input.metadata ?? null;
    secret.updatedAt = new Date();

    return { count: 1 };
  }

  async updateSecret(projectId: string, secretId: string, input: {
    label?: string;
    category?: SecretRecord['category'];
    confidence?: SecretRecord['confidence'];
    metadata?: Record<string, unknown>;
    lastRevealedAt?: Date;
  }) {
    const secret = this.secrets.find((item) => item.projectId === projectId && item.id === secretId);
    if (!secret) {
      return { count: 0 };
    }

    if (input.label !== undefined) {
      secret.label = input.label;
    }

    if (input.category !== undefined) {
      secret.category = input.category;
    }

    if (input.confidence !== undefined) {
      secret.confidence = input.confidence;
    }

    if (input.metadata !== undefined) {
      secret.metadata = input.metadata;
    }

    if (input.lastRevealedAt !== undefined) {
      secret.lastRevealedAt = input.lastRevealedAt;
    }

    secret.updatedAt = new Date();
    return { count: 1 };
  }

  async deleteSecret(projectId: string, secretId: string) {
    const before = this.secrets.length;
    this.secrets = this.secrets.filter((secret) => !(secret.projectId === projectId && secret.id === secretId));
    return { count: before === this.secrets.length ? 0 : 1 };
  }

  async countSecretsReferencingDetection(projectId: string, detectionId: string) {
    return this.secrets.filter(
      (secret) => secret.projectId === projectId && secret.sourceDetectionId === detectionId,
    ).length;
  }

  async deleteDetectionForProject(projectId: string, detectionId: string) {
    const snapshotIds = new Set(
      this.snapshots.filter((item) => item.projectId === projectId).map((item) => item.id),
    );

    const before = this.detections.length;
    this.detections = this.detections.filter(
      (detection) => !(detection.id === detectionId && snapshotIds.has(detection.snapshotId)),
    );

    return { count: before - this.detections.length };
  }

  async listDetectionsForSnapshot(projectId: string, snapshotId: string) {
    const snapshot = this.snapshots.find((item) => item.id === snapshotId && item.projectId === projectId);
    if (!snapshot) {
      return [];
    }

    return this.detections.filter((item) => item.snapshotId === snapshotId);
  }

  async findDetectionByIdForSnapshot(projectId: string, snapshotId: string, detectionId: string) {
    const snapshot = this.snapshots.find((item) => item.id === snapshotId && item.projectId === projectId);
    if (!snapshot) {
      return null;
    }

    return this.detections.find((item) => item.id === detectionId && item.snapshotId === snapshotId) ?? null;
  }

  async upsertDetection(input: {
    snapshotId: string;
    category: DetectionRecord['category'];
    confidence: DetectionRecord['confidence'];
    detectionRule: string;
    sourceFilePath: string;
    sourceLineNumber: number | null;
    maskedPreview: string;
    fingerprint: string;
    metadata?: Record<string, unknown>;
  }) {
    const existing = this.detections.find(
      (item) => item.snapshotId === input.snapshotId && item.fingerprint === input.fingerprint,
    );

    if (existing) {
      existing.category = input.category;
      existing.confidence = input.confidence;
      existing.detectionRule = input.detectionRule;
      existing.sourceFilePath = input.sourceFilePath;
      existing.sourceLineNumber = input.sourceLineNumber;
      existing.maskedPreview = input.maskedPreview;
      existing.metadata = input.metadata ?? null;
      existing.updatedAt = new Date();
      return existing;
    }

    const record: DetectionRecord = {
      id: `detection_${this.detections.length + 1}`,
      snapshotId: input.snapshotId,
      category: input.category,
      confidence: input.confidence,
      status: 'OPEN',
      detectionRule: input.detectionRule,
      sourceFilePath: input.sourceFilePath,
      sourceLineNumber: input.sourceLineNumber,
      maskedPreview: input.maskedPreview,
      fingerprint: input.fingerprint,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.detections.push(record);
    return record;
  }

  async updateDetectionStatus(snapshotId: string, detectionId: string, status: DetectionRecord['status']) {
    const detection = this.detections.find((item) => item.snapshotId === snapshotId && item.id === detectionId);
    if (!detection) {
      return { count: 0 };
    }

    detection.status = status;
    detection.updatedAt = new Date();
    return { count: 1 };
  }

  async createAuditLog(input: { userId?: string; action: string; metadata?: unknown }) {
    this.auditLogs.push(input);
  }
}

class FakeStorage implements SnapshotStorage {
  archives = new Map<string, Buffer>();

  async storeArchive() {
    return {
      storageKey: 'test-storage-key',
      sizeBytes: 0,
      integrityAlgorithm: 'sha256' as const,
      integrityHash: 'test-hash',
    };
  }

  async deleteArchive() {
    return;
  }

  async readArchive(storageKey: string) {
    const archive = this.archives.get(storageKey);
    if (!archive) {
      throw new HttpError(404, 'SNAPSHOT_ARCHIVE_NOT_FOUND', 'archive missing');
    }

    return archive;
  }
}

describe('SecretsService', () => {
  let repository: FakeSecretsRepository;
  let storage: FakeStorage;
  let service: SecretsService;

  beforeEach(async () => {
    repository = new FakeSecretsRepository();
    repository.addProject('user_1', 'project_1');
    repository.addProject('user_2', 'project_2');

    storage = new FakeStorage();

    const archiveBuffer = await createZipBuffer([
      { path: 'project/.env', content: 'API_KEY=sk_live_abcdefghijklmnop' },
      { path: 'project/src/index.ts', content: 'console.log("ok")' },
    ]);

    storage.archives.set('user_1/project_1/snapshot_1/project.zip', archiveBuffer);
    repository.addSnapshot('user_1', 'project_1', 'snapshot_1', 'user_1/project_1/snapshot_1/project.zip');

    service = new SecretsService(repository as never, storage);
  });

  it('processes snapshot detections and keeps masked previews only', async () => {
    const result = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');

    expect(result.detections.length).toBeGreaterThan(0);
    expect(result.detections.every((item) => item.maskedPreview.includes('*'))).toBe(true);
  });

  it('allows owner to create/reveal/delete vault secret', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Manual Secret',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'plain-secret-value-xyz',
    });

    expect(created.maskedValue).not.toContain('plain-secret-value-xyz');

    const revealed = await service.revealSecret('user_1', 'project_1', created.id);
    expect(revealed.value).toBe('plain-secret-value-xyz');

    const deleted = await service.deleteSecret('user_1', 'project_1', created.id);
    expect(deleted.deleted).toBe(true);

    await expect(service.getSecret('user_1', 'project_1', created.id)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });
  });

  it('blocks non-owner secret access', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Owner Secret',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'owner-only-secret',
    });

    await expect(service.getSecret('user_2', 'project_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });

    await expect(service.revealSecret('user_2', 'project_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });

    await expect(service.deleteSecret('user_2', 'project_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('imports detection to vault and marks it imported', async () => {
    const detectionResult = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const first = detectionResult.detections[0];
    expect(first).toBeDefined();

    const secret = await service.createSecret('user_1', 'project_1', {
      label: 'Imported Secret',
      category: first!.category,
      confidence: first!.confidence,
      sourceSnapshotId: 'snapshot_1',
      sourceDetectionId: first!.id,
      sourceFilePath: first!.sourceFilePath,
      ...(first!.sourceLineNumber !== null ? { sourceLineNumber: first!.sourceLineNumber } : {}),
    });

    expect(secret.sourceDetectionId).toBe(first!.id);

    const refreshed = await service.listSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const imported = refreshed.detections.find((item) => item.id === first!.id);
    expect(imported?.status).toBe('IMPORTED');
  });

  it('logs security events without plaintext value in metadata', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Audited',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'audit-secret-value',
    });

    await service.revealSecret('user_1', 'project_1', created.id);
    await service.deleteSecret('user_1', 'project_1', created.id);

    const metadataSerialized = JSON.stringify(repository.auditLogs);
    expect(metadataSerialized.includes('audit-secret-value')).toBe(false);
  });

  it('permanently removes the secret row and all encrypted material on delete', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Permanent Delete',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'permanent-delete-value-123',
    });

    expect(repository.secrets.some((secret) => secret.id === created.id)).toBe(true);

    await service.deleteSecret('user_1', 'project_1', created.id);

    expect(repository.secrets.some((secret) => secret.id === created.id)).toBe(false);

    // Nothing anywhere in the store may still hold the ciphertext or plaintext.
    const storeSerialized = JSON.stringify(repository.secrets);
    expect(storeSerialized).not.toContain('permanent-delete-value-123');
    expect(storeSerialized).not.toContain(created.maskedValue);
  });

  it('removes the deleted secret from the vault listing', async () => {
    const kept = await service.createSecret('user_1', 'project_1', {
      label: 'Kept Secret',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'kept-value',
    });

    const removed = await service.createSecret('user_1', 'project_1', {
      label: 'Removed Secret',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'removed-value',
    });

    await service.deleteSecret('user_1', 'project_1', removed.id);

    const listed = await service.listSecrets('user_1', 'project_1');
    const listedIds = listed.map((secret) => secret.id);

    expect(listedIds).toContain(kept.id);
    expect(listedIds).not.toContain(removed.id);
  });

  it('cannot retrieve or reveal a deleted secret through the API surface', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Gone Secret',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'gone-value-456',
    });

    await service.deleteSecret('user_1', 'project_1', created.id);

    await expect(service.getSecret('user_1', 'project_1', created.id)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });

    await expect(service.revealSecret('user_1', 'project_1', created.id)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });
  });

  it('cannot be undone - deleting twice reports the secret as gone', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Twice Deleted',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'twice-deleted-value',
    });

    await service.deleteSecret('user_1', 'project_1', created.id);

    await expect(service.deleteSecret('user_1', 'project_1', created.id)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });

    await expect(service.updateSecret('user_1', 'project_1', created.id, { label: 'Restored' })).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });
  });

  it('blocks another user from deleting a secret they do not own', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Protected Secret',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'protected-value',
    });

    await expect(service.deleteSecret('user_2', 'project_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });

    // The secret must survive an unauthorized delete attempt.
    expect(repository.secrets.some((secret) => secret.id === created.id)).toBe(true);
    const stillThere = await service.getSecret('user_1', 'project_1', created.id);
    expect(stillThere.id).toBe(created.id);
  });

  it('removes the associated snapshot detection and leaves other detections untouched', async () => {
    const detectionResult = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const detection = detectionResult.detections[0];
    const otherDetection = detectionResult.detections[1];
    expect(detection).toBeDefined();
    expect(otherDetection).toBeDefined();

    const secret = await service.createSecret('user_1', 'project_1', {
      label: 'Detection Backed Secret',
      category: detection!.category,
      confidence: detection!.confidence,
      sourceSnapshotId: 'snapshot_1',
      sourceDetectionId: detection!.id,
      sourceFilePath: detection!.sourceFilePath,
    });

    const deleted = await service.deleteSecret('user_1', 'project_1', secret.id);
    expect(deleted.deletedDetectionId).toBe(detection!.id);

    const detectionsAfter = await service.listSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const remainingIds = detectionsAfter.detections.map((item) => item.id);

    expect(remainingIds).not.toContain(detection!.id);
    expect(remainingIds).toContain(otherDetection!.id);

    // The detection row is physically gone, not flagged with a status.
    expect(repository.detections.some((item) => item.id === detection!.id)).toBe(false);
    expect(JSON.stringify(detectionsAfter.detections)).not.toContain('sk_live_abcdefghijklmnop');
  });

  it('keeps the removal after re-fetching snapshot details', async () => {
    const detectionResult = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const detection = detectionResult.detections[0];

    const secret = await service.createSecret('user_1', 'project_1', {
      label: 'Refetch Secret',
      category: detection!.category,
      confidence: detection!.confidence,
      sourceSnapshotId: 'snapshot_1',
      sourceDetectionId: detection!.id,
      sourceFilePath: detection!.sourceFilePath,
    });

    await service.deleteSecret('user_1', 'project_1', secret.id);

    const firstFetch = await service.listSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const secondFetch = await service.listSnapshotDetections('user_1', 'project_1', 'snapshot_1');

    expect(firstFetch.detections.map((item) => item.id)).not.toContain(detection!.id);
    expect(secondFetch.detections.map((item) => item.id)).not.toContain(detection!.id);
  });

  it('preserves the snapshot record and archive when a secret is deleted', async () => {
    const detectionResult = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const detection = detectionResult.detections[0];

    const snapshotBefore = { ...repository.snapshots.find((item) => item.id === 'snapshot_1')! };
    const archiveBefore = storage.archives.get(snapshotBefore.archiveStorageKey!);

    const secret = await service.createSecret('user_1', 'project_1', {
      label: 'Snapshot Integrity Secret',
      category: detection!.category,
      confidence: detection!.confidence,
      sourceSnapshotId: 'snapshot_1',
      sourceDetectionId: detection!.id,
      sourceFilePath: detection!.sourceFilePath,
    });

    await service.deleteSecret('user_1', 'project_1', secret.id);

    const snapshotAfter = repository.snapshots.find((item) => item.id === 'snapshot_1');

    expect(snapshotAfter).toEqual(snapshotBefore);
    expect(storage.archives.get(snapshotBefore.archiveStorageKey!)).toBe(archiveBefore);
  });

  it('keeps the detection when another vault secret still sources it', async () => {
    const detectionResult = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const detection = detectionResult.detections[0];

    const first = await service.createSecret('user_1', 'project_1', {
      label: 'Shared Detection A',
      category: detection!.category,
      confidence: detection!.confidence,
      sourceSnapshotId: 'snapshot_1',
      sourceDetectionId: detection!.id,
      sourceFilePath: detection!.sourceFilePath,
    });

    await service.createSecret('user_1', 'project_1', {
      label: 'Shared Detection B',
      category: detection!.category,
      confidence: detection!.confidence,
      sourceSnapshotId: 'snapshot_1',
      sourceDetectionId: detection!.id,
      sourceFilePath: detection!.sourceFilePath,
    });

    const deleted = await service.deleteSecret('user_1', 'project_1', first.id);

    expect(deleted.deletedDetectionId).toBeUndefined();
    expect(repository.detections.some((item) => item.id === detection!.id)).toBe(true);
  });

  it('does not touch detections when the deleted secret was manually created', async () => {
    await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const detectionsBefore = await service.listSnapshotDetections('user_1', 'project_1', 'snapshot_1');

    const manual = await service.createSecret('user_1', 'project_1', {
      label: 'Manual Only',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'manual-only-value',
    });

    const deleted = await service.deleteSecret('user_1', 'project_1', manual.id);

    expect(deleted.deletedDetectionId).toBeUndefined();

    const detectionsAfter = await service.listSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    expect(detectionsAfter.detections).toEqual(detectionsBefore.detections);
  });

  it('does not remove detections for an unauthorized delete attempt', async () => {
    const detectionResult = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const detection = detectionResult.detections[0];

    const secret = await service.createSecret('user_1', 'project_1', {
      label: 'Guarded Secret',
      category: detection!.category,
      confidence: detection!.confidence,
      sourceSnapshotId: 'snapshot_1',
      sourceDetectionId: detection!.id,
      sourceFilePath: detection!.sourceFilePath,
    });

    await expect(service.deleteSecret('user_2', 'project_1', secret.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });

    expect(repository.secrets.some((item) => item.id === secret.id)).toBe(true);
    expect(repository.detections.some((item) => item.id === detection!.id)).toBe(true);
  });

  it('records only safe metadata in the SECRET_DELETED audit entry', async () => {
    const created = await service.createSecret('user_1', 'project_1', {
      label: 'Audit Shape',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      value: 'audit-shape-value-789',
    });

    await service.deleteSecret('user_1', 'project_1', created.id);

    const entry = repository.auditLogs.find((log) => log.action === 'SECRET_DELETED');

    expect(entry).toBeDefined();
    expect(entry?.userId).toBe('user_1');
    expect(entry?.metadata).toEqual({ projectId: 'project_1', secretId: created.id });
    expect(JSON.stringify(entry)).not.toContain('audit-shape-value-789');
  });

  it('supports ignore and reopen for detections', async () => {
    const detections = await service.processSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    const target = detections.detections[0];
    expect(target).toBeDefined();

    const ignored = await service.updateDetectionStatus(
      'user_1',
      'project_1',
      'snapshot_1',
      target!.id,
      'IGNORED',
    );
    expect(ignored.status).toBe('IGNORED');

    const reopened = await service.updateDetectionStatus(
      'user_1',
      'project_1',
      'snapshot_1',
      target!.id,
      'OPEN',
    );
    expect(reopened.status).toBe('OPEN');
  });

  it('automatically imports detected .env secrets into vault with encrypted values', async () => {
    const imported = await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_1');

    expect(imported.snapshotId).toBe('snapshot_1');
    expect(imported.detectionsCount).toBeGreaterThan(0);
    expect(imported.createdCount).toBeGreaterThan(0);

    const secrets = await service.listSecrets('user_1', 'project_1');
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets.some((item) => item.label === 'API_KEY')).toBe(true);

    const rawSecretRecord = repository.secrets.find((item) => item.projectId === 'project_1' && item.label === 'API_KEY');
    expect(rawSecretRecord).toBeDefined();
    expect(rawSecretRecord?.encryptedValue).toBeTruthy();
    expect(rawSecretRecord?.encryptedValue).not.toContain('sk_live_abcdefghijklmnop');

    const detections = await service.listSnapshotDetections('user_1', 'project_1', 'snapshot_1');
    expect(detections.detections.every((item) => item.status === 'IMPORTED')).toBe(true);
  });

  it('does not create duplicate vault entries when auto-import runs repeatedly for same snapshot', async () => {
    await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_1');
    const afterFirstImport = await service.listSecrets('user_1', 'project_1');

    await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_1');
    const afterSecondImport = await service.listSecrets('user_1', 'project_1');

    expect(afterSecondImport.length).toBe(afterFirstImport.length);
  });

  it('blocks non-owner access to automatically imported secrets', async () => {
    await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_1');
    const importedSecrets = await service.listSecrets('user_1', 'project_1');
    const firstImported = importedSecrets[0];

    expect(firstImported).toBeDefined();
    if (!firstImported) {
      throw new Error('expected an auto-imported secret');
    }

    await expect(service.getSecret('user_2', 'project_1', firstImported.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('updates existing secret value when newer snapshot has same key with changed value', async () => {
    await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_1');

    const updatedArchive = await createZipBuffer([
      { path: 'project/.env.production', content: 'API_KEY=sk_live_updatedvalue1234567890' },
    ]);
    storage.archives.set('user_1/project_1/snapshot_2/project.zip', updatedArchive);
    repository.addSnapshot('user_1', 'project_1', 'snapshot_2', 'user_1/project_1/snapshot_2/project.zip');

    await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_2');

    const secrets = await service.listSecrets('user_1', 'project_1');
    const apiKeySecret = secrets.find((item) => item.label === 'API_KEY');
    expect(apiKeySecret).toBeDefined();
    expect(apiKeySecret?.sourceSnapshotId).toBe('snapshot_2');

    if (!apiKeySecret) {
      throw new Error('expected API_KEY secret after auto import');
    }

    const revealed = await service.revealSecret('user_1', 'project_1', apiKeySecret.id);
    expect(revealed.value).toBe('sk_live_updatedvalue1234567890');
  });

  it('does not auto-import source code identifiers or test-file fixtures', async () => {
    const noisyArchive = await createZipBuffer([
      {
        path: 'project/src/modules/secrets/secrets.service.ts',
        content: 'const updateSecretSchema = {};\nconst x = secret.metadata;\nthis.secrets = [];',
      },
      {
        path: 'project/tests/secrets.service.test.ts',
        content: 'const API_KEY = "sk_live_fake_testing_value_123456";',
      },
      {
        path: 'project/.env',
        content: 'AUTH_SESSION_SECRET=real_session_secret_123456',
      },
    ]);

    storage.archives.set('user_1/project_1/snapshot_3/project.zip', noisyArchive);
    repository.addSnapshot('user_1', 'project_1', 'snapshot_3', 'user_1/project_1/snapshot_3/project.zip');

    await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_3');
    const secrets = await service.listSecrets('user_1', 'project_1');

    expect(secrets.some((item) => item.label === 'AUTH_SESSION_SECRET')).toBe(true);
    expect(secrets.some((item) => item.label.includes('SECRET.LABEL'))).toBe(false);
    expect(secrets.some((item) => item.label.includes('THIS.SECRETS'))).toBe(false);
  });

  it('cleans previously auto-imported invalid non-env secrets but preserves manual entries', async () => {
    await repository.createSecret({
      projectId: 'project_1',
      label: 'SECRET_LABEL',
      category: 'SECRET_KEY',
      confidence: 'MEDIUM',
      maskedValue: '********',
      encryptedValue: 'ciphertext',
      encryptionIv: 'iv',
      encryptionAuthTag: 'tag',
      encryptionVersion: 'v1',
      sourceFilePath: 'project/src/modules/secrets/secrets.service.ts',
      metadata: {
        source: 'snapshot-auto-detection',
      },
    });

    await repository.createSecret({
      projectId: 'project_1',
      label: 'MANUAL_SECRET',
      category: 'GENERIC_SECRET',
      confidence: 'MEDIUM',
      maskedValue: '********',
      encryptedValue: 'ciphertext-manual',
      encryptionIv: 'iv-manual',
      encryptionAuthTag: 'tag-manual',
      encryptionVersion: 'v1',
      metadata: {
        source: 'manual-entry',
      },
    });

    const listed = await service.listSecrets('user_1', 'project_1');
    expect(listed.some((item) => item.label === 'SECRET_LABEL')).toBe(false);
    expect(listed.some((item) => item.label === 'MANUAL_SECRET')).toBe(true);
  });

  it('does not auto-import internal master keys from env files', async () => {
    const archive = await createZipBuffer([
      {
        path: 'project/.env',
        content: 'VAULT_ENCRYPTION_KEY=internal_master_key_value_123456\nAUTH_SESSION_SECRET=user_session_secret_123456',
      },
    ]);

    storage.archives.set('user_1/project_1/snapshot_4/project.zip', archive);
    repository.addSnapshot('user_1', 'project_1', 'snapshot_4', 'user_1/project_1/snapshot_4/project.zip');

    await service.autoImportSnapshotSecrets('user_1', 'project_1', 'snapshot_4');
    const listed = await service.listSecrets('user_1', 'project_1');

    expect(listed.some((item) => item.label === 'VAULT_ENCRYPTION_KEY')).toBe(false);
    expect(listed.some((item) => item.label === 'AUTH_SESSION_SECRET')).toBe(true);
  });

  it('blocks creating internal system secrets in vault', async () => {
    await expect(
      service.createSecret('user_1', 'project_1', {
        label: 'VAULT_ENCRYPTION_KEY',
        category: 'SECRET_KEY',
        confidence: 'HIGH',
        value: 'master_key_123456789',
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SECRET_PROTECTED',
    });
  });

  it('never lists or exposes pre-existing internal vault records', async () => {
    const created = await repository.createSecret({
      projectId: 'project_1',
      label: 'VAULT_ENCRYPTION_KEY',
      category: 'SECRET_KEY',
      confidence: 'HIGH',
      maskedValue: '****************',
      encryptedValue: 'ciphertext-internal',
      encryptionIv: 'iv-internal',
      encryptionAuthTag: 'tag-internal',
      encryptionVersion: 'v1',
      metadata: {
        source: 'legacy-import',
      },
    });

    const listed = await service.listSecrets('user_1', 'project_1');
    expect(listed.some((item) => item.id === created.id)).toBe(false);

    await expect(service.revealSecret('user_1', 'project_1', created.id)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });

    await expect(service.auditSecretCopied('user_1', 'project_1', created.id)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
    });
  });
});
