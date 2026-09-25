import { describe, expect, it, beforeEach, vi } from 'vitest';
import yauzl from 'yauzl';
import yazl from 'yazl';

import { HttpError } from '../../core/errors/http-error.js';
import { buildDirectoryTreeFromZip } from './snapshots.directory-tree.js';
import { assertSnapshotTransition } from './snapshots.lifecycle.js';
import { SnapshotsService } from './snapshots.service.js';
import type { SnapshotStorage } from './snapshots.storage.js';

async function createZipBuffer(entries: Array<{ path: string; content?: string }>) {
  const zipFile = new yazl.ZipFile();

  for (const entry of entries) {
    if (entry.content !== undefined) {
      zipFile.addBuffer(Buffer.from(entry.content), entry.path);
      continue;
    }

    zipFile.addEmptyDirectory(entry.path);
  }

  zipFile.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zipFile.outputStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function readZipEntryText(archiveBuffer: Buffer, targetPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(archiveBuffer, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('Unable to open archive'));
        return;
      }

      let found = false;

      zipFile.on('entry', (entry) => {
        if (String(entry.fileName) !== targetPath) {
          zipFile.readEntry();
          return;
        }

        found = true;
        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            reject(streamError ?? new Error('Unable to read entry'));
            return;
          }

          const chunks: Buffer[] = [];
          readStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          readStream.on('error', reject);
          readStream.on('end', () => {
            zipFile.close();
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        });
      });

      zipFile.on('end', () => {
        if (!found) {
          resolve(null);
        }
      });

      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

type SnapshotRecord = {
  id: string;
  projectId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  captureSource: 'EXTENSION' | 'WEB' | 'API';
  clientName: string | null;
  clientVersion: string | null;
  archiveStorageKey: string | null;
  archiveContentType: string | null;
  archiveSizeBytes: number | null;
  fileCount: number | null;
  directoryCount: number | null;
  integrityAlgorithm: string | null;
  integrityHash: string | null;
  failureCode: string | null;
  failureReason: string | null;
  captureMetadata: Record<string, unknown> | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type BlueprintRecord = {
  id: string;
  snapshotId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  projectType: string | null;
  detectedFrameworks: unknown;
  detectedLanguages: unknown;
  importantConfigFiles: unknown;
  dependencyMetadata: unknown;
  entryPoints: unknown;
  detectedCommands: unknown;
  environmentReferences: unknown;
  summary: string | null;
  failureCode: string | null;
  failureReason: string | null;
  processedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type SecretRecord = {
  id: string;
  projectId: string;
  sourceSnapshotId: string | null;
  sourceDetectionId: string | null;
  encryptedValue: string;
};

type SecretDetectionRecord = {
  id: string;
  snapshotId: string;
};

class FakeSnapshotsRepository {
  projectsByOwner = new Map<string, Set<string>>();
  snapshots: SnapshotRecord[] = [];
  blueprints: BlueprintRecord[] = [];
  secrets: SecretRecord[] = [];
  secretDetections: SecretDetectionRecord[] = [];
  auditLogs: Array<{ userId?: string; action: string; metadata?: unknown }> = [];

  addProject(ownerId: string, projectId: string) {
    const current = this.projectsByOwner.get(ownerId) ?? new Set<string>();
    current.add(projectId);
    this.projectsByOwner.set(ownerId, current);
  }

  async findProjectByIdForOwner(ownerId: string, projectId: string) {
    const projectIds = this.projectsByOwner.get(ownerId);
    if (!projectIds?.has(projectId)) {
      return null;
    }

    return { id: projectId };
  }

  async createSnapshot(input: {
    projectId: string;
    status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    captureSource: 'EXTENSION' | 'WEB' | 'API';
    clientName?: string;
    clientVersion?: string;
    fileCount?: number;
    directoryCount?: number;
    captureMetadata?: Record<string, unknown>;
    archiveContentType?: string;
    archiveSizeBytes?: number;
  }) {
    const record: SnapshotRecord = {
      id: `snapshot_${this.snapshots.length + 1}`,
      projectId: input.projectId,
      status: input.status ?? 'PENDING',
      captureSource: input.captureSource,
      clientName: input.clientName ?? null,
      clientVersion: input.clientVersion ?? null,
      archiveStorageKey: null,
      archiveContentType: input.archiveContentType ?? null,
      archiveSizeBytes: input.archiveSizeBytes ?? null,
      fileCount: input.fileCount ?? null,
      directoryCount: input.directoryCount ?? null,
      integrityAlgorithm: null,
      integrityHash: null,
      failureCode: null,
      failureReason: null,
      captureMetadata: input.captureMetadata ?? null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.snapshots.push(record);
    return record;
  }

  async findSnapshotByIdForProject(projectId: string, snapshotId: string) {
    return this.snapshots.find((snapshot) => snapshot.projectId === projectId && snapshot.id === snapshotId) ?? null;
  }

  async findSnapshotByIdForOwner(ownerId: string, projectId: string, snapshotId: string) {
    const projectIds = this.projectsByOwner.get(ownerId);
    if (!projectIds?.has(projectId)) {
      return null;
    }

    const snapshot = this.snapshots.find((item) => item.projectId === projectId && item.id === snapshotId) ?? null;
    if (!snapshot) {
      return null;
    }

    const blueprint = this.blueprints.find((item) => item.snapshotId === snapshot.id) ?? null;

    return {
      ...snapshot,
      blueprint,
    };
  }

  async listSnapshotsByProject(projectId: string) {
    return this.snapshots
      .filter((snapshot) => snapshot.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateSnapshot(
    projectId: string,
    snapshotId: string,
    input: {
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
      captureMetadata?: Record<string, unknown>;
    },
  ) {
    const record = this.snapshots.find((snapshot) => snapshot.projectId === projectId && snapshot.id === snapshotId);
    if (!record) {
      return { count: 0 };
    }

    if (input.status !== undefined) {
      record.status = input.status;
    }

    if (input.archiveStorageKey !== undefined) {
      record.archiveStorageKey = input.archiveStorageKey;
    }

    if (input.archiveContentType !== undefined) {
      record.archiveContentType = input.archiveContentType;
    }

    if (input.archiveSizeBytes !== undefined) {
      record.archiveSizeBytes = input.archiveSizeBytes;
    }

    if (input.integrityAlgorithm !== undefined) {
      record.integrityAlgorithm = input.integrityAlgorithm;
    }

    if (input.integrityHash !== undefined) {
      record.integrityHash = input.integrityHash;
    }

    if (input.failureCode !== undefined) {
      record.failureCode = input.failureCode;
    }

    if (input.failureReason !== undefined) {
      record.failureReason = input.failureReason;
    }

    if (input.processedAt !== undefined) {
      record.processedAt = input.processedAt;
    }

    if (input.fileCount !== undefined) {
      record.fileCount = input.fileCount;
    }

    if (input.directoryCount !== undefined) {
      record.directoryCount = input.directoryCount;
    }

    if (input.captureMetadata !== undefined) {
      record.captureMetadata = input.captureMetadata;
    }

    record.updatedAt = new Date();
    return { count: 1 };
  }

  async deleteSnapshotWithDependencies(projectId: string, snapshotId: string) {
    const target = this.snapshots.find((snapshot) => snapshot.projectId === projectId && snapshot.id === snapshotId);
    if (!target) {
      return {
        deletedCount: 0,
        blueprintsDeleted: 0,
        detectionsDeleted: 0,
        sourceSnapshotRefsCleared: 0,
        sourceDetectionRefsCleared: 0,
      };
    }

    const detectionIds = this.secretDetections
      .filter((detection) => detection.snapshotId === snapshotId)
      .map((detection) => detection.id);

    let sourceSnapshotRefsCleared = 0;
    let sourceDetectionRefsCleared = 0;

    this.secrets = this.secrets.map((secret) => {
      if (secret.projectId !== projectId) {
        return secret;
      }

      let next = secret;

      if (secret.sourceSnapshotId === snapshotId) {
        next = {
          ...next,
          sourceSnapshotId: null,
        };
        sourceSnapshotRefsCleared += 1;
      }

      if (secret.sourceDetectionId && detectionIds.includes(secret.sourceDetectionId)) {
        next = {
          ...next,
          sourceDetectionId: null,
        };
        sourceDetectionRefsCleared += 1;
      }

      return next;
    });

    const beforeBlueprints = this.blueprints.length;
    this.blueprints = this.blueprints.filter((blueprint) => blueprint.snapshotId !== snapshotId);
    const blueprintsDeleted = beforeBlueprints - this.blueprints.length;

    const beforeDetections = this.secretDetections.length;
    this.secretDetections = this.secretDetections.filter((detection) => detection.snapshotId !== snapshotId);
    const detectionsDeleted = beforeDetections - this.secretDetections.length;

    const beforeSnapshots = this.snapshots.length;
    this.snapshots = this.snapshots.filter(
      (snapshot) => !(snapshot.projectId === projectId && snapshot.id === snapshotId),
    );
    const deletedCount = beforeSnapshots - this.snapshots.length;

    return {
      deletedCount,
      blueprintsDeleted,
      detectionsDeleted,
      sourceSnapshotRefsCleared,
      sourceDetectionRefsCleared,
    };
  }

  async createBlueprint(input: {
    snapshotId: string;
    status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    projectType?: string | null;
    detectedFrameworks?: string[];
    detectedLanguages?: string[];
    importantConfigFiles?: string[];
    dependencyMetadata?: Record<string, unknown> | null;
    entryPoints?: string[];
    detectedCommands?: string[];
    environmentReferences?: string[];
    summary?: string | null;
    failureCode?: string | null;
    failureReason?: string | null;
    processedAt?: Date | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const record: BlueprintRecord = {
      id: `blueprint_${this.blueprints.length + 1}`,
      snapshotId: input.snapshotId,
      status: input.status ?? 'PENDING',
      projectType: input.projectType ?? null,
      detectedFrameworks: input.detectedFrameworks ?? [],
      detectedLanguages: input.detectedLanguages ?? [],
      importantConfigFiles: input.importantConfigFiles ?? [],
      dependencyMetadata: input.dependencyMetadata ?? null,
      entryPoints: input.entryPoints ?? [],
      detectedCommands: input.detectedCommands ?? [],
      environmentReferences: input.environmentReferences ?? [],
      summary: input.summary ?? null,
      failureCode: input.failureCode ?? null,
      failureReason: input.failureReason ?? null,
      processedAt: input.processedAt ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.blueprints.push(record);
    return record;
  }

  async findBlueprintBySnapshotId(projectId: string, snapshotId: string) {
    const snapshot = this.snapshots.find((item) => item.id === snapshotId && item.projectId === projectId);
    if (!snapshot) {
      return null;
    }

    return this.blueprints.find((item) => item.snapshotId === snapshotId) ?? null;
  }

  async updateBlueprintBySnapshotId(
    snapshotId: string,
    input: {
      status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
      projectType?: string | null;
      detectedFrameworks?: string[];
      detectedLanguages?: string[];
      importantConfigFiles?: string[];
      dependencyMetadata?: Record<string, unknown> | null;
      entryPoints?: string[];
      detectedCommands?: string[];
      environmentReferences?: string[];
      summary?: string | null;
      failureCode?: string | null;
      failureReason?: string | null;
      processedAt?: Date | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const record = this.blueprints.find((item) => item.snapshotId === snapshotId);
    if (!record) {
      return { count: 0 };
    }

    if (input.status !== undefined) {
      record.status = input.status;
    }

    if (input.projectType !== undefined) {
      record.projectType = input.projectType;
    }

    if (input.detectedFrameworks !== undefined) {
      record.detectedFrameworks = input.detectedFrameworks;
    }

    if (input.detectedLanguages !== undefined) {
      record.detectedLanguages = input.detectedLanguages;
    }

    if (input.importantConfigFiles !== undefined) {
      record.importantConfigFiles = input.importantConfigFiles;
    }

    if (input.dependencyMetadata !== undefined) {
      record.dependencyMetadata = input.dependencyMetadata;
    }

    if (input.entryPoints !== undefined) {
      record.entryPoints = input.entryPoints;
    }

    if (input.detectedCommands !== undefined) {
      record.detectedCommands = input.detectedCommands;
    }

    if (input.environmentReferences !== undefined) {
      record.environmentReferences = input.environmentReferences;
    }

    if (input.summary !== undefined) {
      record.summary = input.summary;
    }

    if (input.failureCode !== undefined) {
      record.failureCode = input.failureCode;
    }

    if (input.failureReason !== undefined) {
      record.failureReason = input.failureReason;
    }

    if (input.processedAt !== undefined) {
      record.processedAt = input.processedAt;
    }

    if (input.metadata !== undefined) {
      record.metadata = input.metadata;
    }

    record.updatedAt = new Date();
    return { count: 1 };
  }

  async deleteBlueprintBySnapshotId(projectId: string, snapshotId: string) {
    const snapshot = this.snapshots.find((item) => item.id === snapshotId && item.projectId === projectId);
    if (!snapshot) {
      return { count: 0 };
    }

    const before = this.blueprints.length;
    this.blueprints = this.blueprints.filter((item) => item.snapshotId !== snapshotId);
    return { count: before === this.blueprints.length ? 0 : 1 };
  }

  async createAuditLog(input: { userId?: string; action: string; metadata?: unknown }) {
    this.auditLogs.push(input);
  }
}

class FakeStorage implements SnapshotStorage {
  storeCalls: string[] = [];
  deleteCalls: string[] = [];
  readCalls: string[] = [];
  archives = new Map<string, Buffer>();
  shouldFailOnStore = false;
  shouldFailOnDelete = false;
  shouldReturnInvalidArchive = false;

  async storeArchive(input: {
    ownerId: string;
    projectId: string;
    snapshotId: string;
    buffer: Buffer;
    contentType: string;
  }) {
    if (this.shouldFailOnStore) {
      throw new HttpError(500, 'STORAGE_FAILURE', 'Storage failed');
    }

    this.storeCalls.push(input.snapshotId);
    const storageKey = `${input.ownerId}/${input.projectId}/${input.snapshotId}/project.zip`;
    this.archives.set(storageKey, input.buffer);

    return {
      storageKey,
      sizeBytes: input.buffer.byteLength,
      integrityAlgorithm: 'sha256' as const,
      integrityHash: 'abc123hash',
    };
  }

  async deleteArchive(storageKey: string) {
    if (this.shouldFailOnDelete) {
      throw new HttpError(500, 'STORAGE_DELETE_FAILED', 'Storage delete failed');
    }

    this.deleteCalls.push(storageKey);
    this.archives.delete(storageKey);
  }

  async readArchive(storageKey: string) {
    this.readCalls.push(storageKey);

    if (this.shouldReturnInvalidArchive) {
      return Buffer.from('not-a-zip');
    }

    const buffer = this.archives.get(storageKey);
    if (!buffer) {
      throw new HttpError(404, 'SNAPSHOT_ARCHIVE_NOT_FOUND', 'Snapshot archive not found');
    }

    return buffer;
  }
}

describe('SnapshotsService', () => {
  let repository: FakeSnapshotsRepository;
  let storage: FakeStorage;
  let service: SnapshotsService;

  let archiveBuffer: Buffer;
  let archiveBase64: string;

  beforeEach(async () => {
    repository = new FakeSnapshotsRepository();
    repository.addProject('user_1', 'project_1');
    repository.addProject('user_2', 'project_2');

    archiveBuffer = await createZipBuffer([
      { path: 'project/src' },
      { path: 'project/src/index.ts', content: 'export const value = 1;' },
      { path: 'project/package.json', content: '{"name":"project"}' },
    ]);
    archiveBase64 = archiveBuffer.toString('base64');

    storage = new FakeStorage();
    service = new SnapshotsService(repository as never, storage);
  });

  it('creates snapshot for authenticated owner', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
      fileCount: 2,
      directoryCount: 1,
      entries: [
        { path: 'src/index.ts', type: 'FILE' },
        { path: 'src', type: 'DIRECTORY' },
      ],
    });

    expect(snapshot.status).toBe('COMPLETED');
    expect(snapshot.projectId).toBe('project_1');
    expect(snapshot.integrityHash).toBe('abc123hash');
    expect(snapshot.archiveStorageKey).toContain('project_1');
    expect(snapshot.fileCount).toBe(2);
    expect(snapshot.directoryCount).toBe(3);
    expect(snapshot.captureMetadata?.serverProcessed).toBeDefined();
  });

  it('automatically triggers secret vault sync during snapshot processing', async () => {
    const autoImportSnapshotSecrets = async () => ({
      snapshotId: 'snapshot_1',
      detectionsCount: 1,
      createdCount: 1,
      updatedCount: 0,
    });

    const autoImportSpy = vi.fn(autoImportSnapshotSecrets);
    const serviceWithAutoImport = new SnapshotsService(repository as never, storage, {
      autoImportSnapshotSecrets: autoImportSpy,
    });

    const snapshot = await serviceWithAutoImport.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    expect(snapshot.status).toBe('COMPLETED');
    expect(autoImportSpy).toHaveBeenCalledTimes(1);
    expect(autoImportSpy).toHaveBeenCalledWith('user_1', 'project_1', snapshot.id, expect.any(Buffer));
  });

  it('retrieves generated directory tree for completed snapshot', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const tree = await service.getSnapshotDirectoryTree('user_1', 'project_1', snapshot.id);

    expect(tree.status).toBe('COMPLETED');
    expect(tree.directoryTree?.totalFiles).toBe(2);
    expect(tree.directoryTree?.nodes[0]?.name).toBe('project');
  });

  it('includes .env.* files in generated directory tree', async () => {
    const envArchive = await createZipBuffer([
      { path: 'project/.env.local', content: 'APP_ENV=local' },
      { path: 'project/.env.production', content: 'APP_ENV=production' },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: envArchive.toString('base64'),
        sizeBytes: envArchive.byteLength,
      },
    });

    const tree = await service.getSnapshotDirectoryTree('user_1', 'project_1', snapshot.id);
    const projectNode = tree.directoryTree?.nodes.find((node) => node.relativePath === 'project');

    expect(projectNode?.children.some((node) => node.relativePath === 'project/.env.local')).toBe(true);
    expect(projectNode?.children.some((node) => node.relativePath === 'project/.env.production')).toBe(true);
  });

  it('returns text file content preview for authorized owner', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const file = await service.getSnapshotFileContent('user_1', 'project_1', snapshot.id, 'project/src/index.ts');

    expect(file.file.supported).toBe(true);
    expect(file.file.isText).toBe(true);
    expect(file.file.content).toContain('export const value = 1;');
  });

  it('masks detected secret values in file content preview', async () => {
    const secretArchive = await createZipBuffer([
      {
        path: 'project/.env',
        content: 'API_KEY=ghp_abcd1234abcd1234abcd1234',
      },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: secretArchive.toString('base64'),
        sizeBytes: secretArchive.byteLength,
      },
    });

    const file = await service.getSnapshotFileContent('user_1', 'project_1', snapshot.id, 'project/.env');

    expect(file.file.redactionApplied).toBe(true);
    expect(file.file.content).not.toContain('ghp_abcd1234abcd1234abcd1234');
    expect(file.file.content).toContain('****');
  });

  it('treats .env.* as text preview and masks detected secret values', async () => {
    const secretArchive = await createZipBuffer([
      {
        path: 'project/.env.local',
        content: 'DATABASE_PASSWORD=myActualPassword123\nAPI_KEY=sk_live_abc123xyz987654',
      },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: secretArchive.toString('base64'),
        sizeBytes: secretArchive.byteLength,
      },
    });

    const file = await service.getSnapshotFileContent('user_1', 'project_1', snapshot.id, 'project/.env.local');

    expect(file.file.supported).toBe(true);
    expect(file.file.isText).toBe(true);
    expect(file.file.contentTypeGuess).toBe('text/plain');
    expect(file.file.redactionApplied).toBe(true);
    expect(file.file.content).toContain('DATABASE_PASSWORD=');
    expect(file.file.content).toContain('API_KEY=');
    expect(file.file.content).not.toContain('myActualPassword123');
    expect(file.file.content).not.toContain('sk_live_abc123xyz987654');
  });

  it('always redacts internal master key values in env preview', async () => {
    const secretArchive = await createZipBuffer([
      {
        path: 'project/.env',
        content: 'VAULT_ENCRYPTION_KEY=master_key_for_internal_use\nPORT=3000',
      },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: secretArchive.toString('base64'),
        sizeBytes: secretArchive.byteLength,
      },
    });

    const file = await service.getSnapshotFileContent('user_1', 'project_1', snapshot.id, 'project/.env');

    expect(file.file.supported).toBe(true);
    expect(file.file.redactionApplied).toBe(true);
    expect(file.file.content).not.toContain('master_key_for_internal_use');
    expect(file.file.content).toContain('VAULT_ENCRYPTION_KEY=');
    expect(file.file.content).toContain('PORT=3000');
  });

  it('returns metadata-only placeholder for unsupported binary-like extension', async () => {
    const unsupportedArchive = await createZipBuffer([
      {
        path: 'project/assets/logo.png',
        content: 'not-really-a-png',
      },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: unsupportedArchive.toString('base64'),
        sizeBytes: unsupportedArchive.byteLength,
      },
    });

    const file = await service.getSnapshotFileContent('user_1', 'project_1', snapshot.id, 'project/assets/logo.png');

    expect(file.file.supported).toBe(false);
    expect(file.file.unsupportedReason).toBe('UNSUPPORTED_FILE_TYPE');
    expect(file.file.content).toBeNull();
  });

  it('rejects path traversal for snapshot file content', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await expect(service.getSnapshotFileContent('user_1', 'project_1', snapshot.id, '../secrets.env')).rejects.toMatchObject(
      {
        code: 'UNSAFE_PATH',
      },
    );
  });

  it('blocks non-owner file content access', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await expect(service.getSnapshotFileContent('user_2', 'project_1', snapshot.id, 'project/src/index.ts')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('returns not-found when file path is absent in snapshot', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await expect(
      service.getSnapshotFileContent('user_1', 'project_1', snapshot.id, 'project/src/missing.ts'),
    ).rejects.toMatchObject({
      code: 'SNAPSHOT_FILE_NOT_FOUND',
    });
  });

  it('rejects snapshot creation for non-owner', async () => {
    await expect(
      service.createSnapshot('user_2', 'project_1', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: archiveBase64,
          sizeBytes: archiveBuffer.byteLength,
        },
      }),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('rejects invalid project id safely', async () => {
    await expect(
      service.createSnapshot('user_1', 'missing_project', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: archiveBase64,
          sizeBytes: archiveBuffer.byteLength,
        },
      }),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('lists only snapshots for authorized project', async () => {
    await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await service.createSnapshot('user_2', 'project_2', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const list = await service.listSnapshots('user_1', 'project_1');
    expect(list).toHaveLength(1);
    expect(list[0]?.projectId).toBe('project_1');
  });

  it('rejects cross-user snapshot list access', async () => {
    await expect(service.listSnapshots('user_1', 'project_2')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('allows owner snapshot detail access and blocks non-owner', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const found = await service.getSnapshot('user_1', 'project_1', snapshot.id);
    expect(found.id).toBe(snapshot.id);

    await expect(service.getSnapshot('user_2', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('handles failed processing lifecycle safely', async () => {
    storage.shouldFailOnStore = true;

    await expect(
      service.createSnapshot('user_1', 'project_1', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: archiveBase64,
          sizeBytes: archiveBuffer.byteLength,
        },
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });

    const failed = repository.snapshots[0];
    expect(failed?.status).toBe('FAILED');
    expect(failed?.failureCode).toBe('STORAGE_FAILURE');
  });

  it('marks snapshot as failed when archive cannot be processed', async () => {
    storage.shouldReturnInvalidArchive = true;

    await expect(
      service.createSnapshot('user_1', 'project_1', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: archiveBase64,
          sizeBytes: archiveBuffer.byteLength,
        },
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_ARCHIVE_INVALID' });

    const failed = repository.snapshots[0];
    expect(failed?.status).toBe('FAILED');
  });

  it('rejects path traversal in archive entries', async () => {
    await expect(
      service.createSnapshot('user_1', 'project_1', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: archiveBase64,
          sizeBytes: archiveBuffer.byteLength,
        },
        entries: [{ path: '../secrets.env', type: 'FILE' }],
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });

  it('rejects absolute entry paths', async () => {
    await expect(
      service.createSnapshot('user_1', 'project_1', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: archiveBase64,
          sizeBytes: archiveBuffer.byteLength,
        },
        entries: [{ path: '/etc/passwd', type: 'FILE' }],
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_INVALID_ENTRY_PATH' });
  });

  it('rejects archive size mismatches', async () => {
    await expect(
      service.createSnapshot('user_1', 'project_1', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: archiveBase64,
          sizeBytes: archiveBuffer.byteLength + 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_ARCHIVE_SIZE_MISMATCH' });
  });

  it('rejects oversized uploads', async () => {
    const hugeBuffer = Buffer.allocUnsafe(6 * 1024 * 1024).fill(97);

    await expect(
      service.createSnapshot('user_1', 'project_1', {
        captureSource: 'API',
        archive: {
          fileName: 'project.zip',
          contentType: 'application/zip',
          base64Data: hugeBuffer.toString('base64'),
          sizeBytes: hugeBuffer.byteLength,
        },
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_ARCHIVE_TOO_LARGE' });
  });

  it('deletes snapshot with storage cleanup', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const deleted = await service.deleteSnapshot('user_1', 'project_1', snapshot.id);
    expect(deleted.id).toBe(snapshot.id);
    expect(storage.deleteCalls).toHaveLength(1);
  });

  it('clears snapshot-linked references while preserving vault secrets on snapshot deletion', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    repository.secretDetections.push({
      id: 'detection_1',
      snapshotId: snapshot.id,
    });

    repository.secrets.push({
      id: 'secret_1',
      projectId: 'project_1',
      sourceSnapshotId: snapshot.id,
      sourceDetectionId: 'detection_1',
      encryptedValue: 'ciphertext-vault-secret',
    });

    await service.deleteSnapshot('user_1', 'project_1', snapshot.id);

    expect(repository.snapshots.some((item) => item.id === snapshot.id)).toBe(false);
    expect(repository.secretDetections.some((item) => item.snapshotId === snapshot.id)).toBe(false);

    const secret = repository.secrets.find((item) => item.id === 'secret_1');
    expect(secret).toBeDefined();
    expect(secret?.sourceSnapshotId).toBeNull();
    expect(secret?.sourceDetectionId).toBeNull();
    expect(secret?.encryptedValue).toBe('ciphertext-vault-secret');
  });

  it('reports snapshot delete cleanup failures safely', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    storage.shouldFailOnDelete = true;

    await expect(service.deleteSnapshot('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_DELETED_STORAGE_CLEANUP_FAILED',
    });

    await expect(service.getSnapshot('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('rejects cross-user delete by ownership', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await expect(service.deleteSnapshot('user_2', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('rejects cross-user directory tree access by ownership', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await expect(service.getSnapshotDirectoryTree('user_2', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('processes blueprint with framework and language detection', async () => {
    const blueprintArchive = await createZipBuffer([
      { path: 'project/src' },
      { path: 'project/src/main.tsx', content: 'import React from "react";' },
      { path: 'project/prisma' },
      {
        path: 'project/prisma/schema.prisma',
        content:
          'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "postgresql" url = env("DATABASE_URL") }',
      },
      {
        path: 'project/package.json',
        content:
          '{"name":"project","main":"src/main.tsx","dependencies":{"react":"^18.0.0","fastify":"^4.0.0","pg":"^8.0.0","prisma":"^5.0.0"},"scripts":{"dev":"vite","build":"tsc"}}',
      },
      {
        path: 'project/.env.example',
        content:
          'DATABASE_URL=postgres://localhost:5432/app\nAPI_KEY=sk_live_abc123456\nVAULT_ENCRYPTION_KEY=internal-only',
      },
      {
        path: 'project/docker-compose.yml',
        content: 'services:\n  app:\n    build: .',
      },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: blueprintArchive.toString('base64'),
        sizeBytes: blueprintArchive.byteLength,
      },
    });

    const processed = await service.processSnapshotBlueprint('user_1', 'project_1', snapshot.id);

    expect(processed.blueprint.status).toBe('COMPLETED');
    expect(processed.blueprint.detectedFrameworks).toContain('React');
    expect(processed.blueprint.detectedFrameworks).toContain('Fastify');
    expect(processed.blueprint.detectedLanguages).toContain('TypeScript');
    expect(processed.blueprint.importantConfigFiles).toContain('project/package.json');

    expect(processed.blueprint.metadata?.projectIdentity).toMatchObject({
      projectName: 'project',
      runtime: 'Node.js',
      packageManager: 'npm',
    });

    expect(processed.blueprint.metadata?.database).toMatchObject({
      detected: true,
      technology: 'Postgresql',
      orm: 'Prisma',
      schemaFile: 'project/prisma/schema.prisma',
    });

    expect(processed.blueprint.metadata?.deployment).toMatchObject({
      containerizationDetected: true,
      deploymentFiles: ['project/docker-compose.yml'],
    });

    const environmentSection =
      processed.blueprint.metadata &&
      typeof processed.blueprint.metadata === 'object' &&
      !Array.isArray(processed.blueprint.metadata)
        ? ((processed.blueprint.metadata.environment as { variables?: Array<{ name: string }> } | undefined) ?? undefined)
        : undefined;

    const environmentVariables = environmentSection?.variables ?? [];
    expect(environmentVariables.some((item) => item.name === 'DATABASE_URL')).toBe(true);
    expect(environmentVariables.some((item) => item.name === 'API_KEY')).toBe(true);
    expect(environmentVariables.some((item) => item.name === 'VAULT_ENCRYPTION_KEY')).toBe(false);

    expect(processed.blueprint.detectedCommands).toContain('npm install');
    expect(processed.blueprint.detectedCommands).toContain('npm run dev');
    expect(processed.blueprint.summary).toContain('architecture');
  });

  it('prevents non-owner blueprint access and deletion', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await service.processSnapshotBlueprint('user_1', 'project_1', snapshot.id);

    await expect(service.getSnapshotBlueprint('user_2', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });

    await expect(service.processSnapshotBlueprint('user_2', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });

    await expect(service.deleteSnapshotBlueprint('user_2', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('marks blueprint as failed when processing archive becomes invalid', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    storage.shouldReturnInvalidArchive = true;

    await expect(service.processSnapshotBlueprint('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_ARCHIVE_INVALID',
    });

    const blueprint = repository.blueprints.find((item) => item.snapshotId === snapshot.id);
    expect(blueprint?.status).toBe('FAILED');
  });

  it('deletes blueprint and blocks retrieval afterward', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await service.processSnapshotBlueprint('user_1', 'project_1', snapshot.id);
    await service.deleteSnapshotBlueprint('user_1', 'project_1', snapshot.id);

    await expect(service.getSnapshotBlueprint('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'BLUEPRINT_NOT_FOUND',
    });
  });

  it('deletes snapshot and cascades blueprint removal', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'EXTENSION',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await service.processSnapshotBlueprint('user_1', 'project_1', snapshot.id);
    await service.deleteSnapshot('user_1', 'project_1', snapshot.id);

    await expect(service.getSnapshot('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('allows an authorized owner to download their snapshot archive', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const result = await service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id);

    expect(result.contentType).toBe('application/zip');
    expect(result.buffer.byteLength).toBeGreaterThan(0);
    expect(result.fileName).toMatch(/_snapshot_.+\.zip$/);
  });

  it('downloads the exact archive stored for that snapshot', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const result = await service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id);

    const originalTree = await buildDirectoryTreeFromZip({
      archiveBuffer,
      maxFiles: 1000,
      maxDirectories: 1000,
      maxEntries: 2000,
      maxPathLength: 400,
      maxTotalBytes: 10 * 1024 * 1024,
    });

    const downloadedTree = await buildDirectoryTreeFromZip({
      archiveBuffer: result.buffer,
      maxFiles: 1000,
      maxDirectories: 1000,
      maxEntries: 2000,
      maxPathLength: 400,
      maxTotalBytes: 10 * 1024 * 1024,
    });

    expect(downloadedTree.totalFiles).toBe(originalTree.totalFiles);
  });

  it('preserves the complete directory structure inside the downloaded archive', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const result = await service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id);

    const tree = await buildDirectoryTreeFromZip({
      archiveBuffer: result.buffer,
      maxFiles: 1000,
      maxDirectories: 1000,
      maxEntries: 2000,
      maxPathLength: 400,
      maxTotalBytes: 10 * 1024 * 1024,
    });

    expect(tree.totalFiles).toBeGreaterThan(0);
    expect(tree.nodes.length).toBeGreaterThan(0);
  });

  it('rejects snapshot download for a different user', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await expect(service.downloadSnapshotAsZip('user_2', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('rejects snapshot download when the archive is missing from storage', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const stored = repository.snapshots.find((item) => item.id === snapshot.id);
    if (stored) {
      stored.archiveStorageKey = null;
    }

    await expect(service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NO_ARCHIVE',
    });
  });

  it('rejects snapshot download while the snapshot is not COMPLETED', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const stored = repository.snapshots.find((item) => item.id === snapshot.id);
    if (stored) {
      stored.status = 'PROCESSING';
    }

    await expect(service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_READY',
    });
  });

  it('does not mutate snapshot state when downloading', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const before = await service.getSnapshot('user_1', 'project_1', snapshot.id);
    await service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id);
    const after = await service.getSnapshot('user_1', 'project_1', snapshot.id);

    expect(after).toEqual(before);
    expect(repository.snapshots).toHaveLength(1);
  });

  it('masks env secret values inside the downloaded archive', async () => {
    const secretArchive = await createZipBuffer([
      { path: 'project/src' },
      { path: 'project/src/index.ts', content: 'export const value = 1;' },
      {
        path: 'project/.env',
        content: [
          'APP_NAME=octopus',
          'OPENAI_API_KEY=sk-live-abcdef1234567890abcdef1234567890',
          'DATABASE_URL=postgresql://admin:SuperSecretPassword123@db.internal:5432/octopus',
          'JWT_SECRET=jwt-super-secret-value-9876543210',
        ].join('\n'),
      },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: secretArchive.toString('base64'),
        sizeBytes: secretArchive.byteLength,
      },
    });

    const result = await service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id);
    const envContent = (await readZipEntryText(result.buffer, 'project/.env')) ?? '';

    expect(envContent).not.toContain('sk-live-abcdef1234567890abcdef1234567890');
    expect(envContent).not.toContain('SuperSecretPassword123');
    expect(envContent).not.toContain('jwt-super-secret-value-9876543210');
    expect(envContent).toContain('OPENAI_API_KEY=');
    expect(envContent).toContain('DATABASE_URL=');
    expect(envContent).toContain('JWT_SECRET=');
    expect(result.sanitizedFileCount).toBeGreaterThan(0);
  });

  it('preserves env file structure while masking values', async () => {
    const secretArchive = await createZipBuffer([
      {
        path: 'project/.env',
        content: 'OPENAI_API_KEY=sk-live-abcdef1234567890abcdef1234567890\nAPP_NAME=octopus',
      },
    ]);

    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: secretArchive.toString('base64'),
        sizeBytes: secretArchive.byteLength,
      },
    });

    const result = await service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id);

    const tree = await buildDirectoryTreeFromZip({
      archiveBuffer: result.buffer,
      maxFiles: 1000,
      maxDirectories: 1000,
      maxEntries: 2000,
      maxPathLength: 400,
      maxTotalBytes: 10 * 1024 * 1024,
    });

    const flatten = (nodes: Array<{ relativePath: string; children: unknown[] }>): string[] =>
      nodes.flatMap((node) => [
        node.relativePath,
        ...flatten(node.children as Array<{ relativePath: string; children: unknown[] }>),
      ]);

    expect(flatten(tree.nodes as never)).toContain('project/.env');
  });

  it('rejects download for non-zip archive content types', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    const stored = repository.snapshots.find((item) => item.id === snapshot.id);
    if (stored) {
      stored.archiveContentType = 'application/x-tar';
    }

    await expect(service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id)).rejects.toMatchObject({
      code: 'SNAPSHOT_ARCHIVE_UNSUPPORTED_FOR_DOWNLOAD',
    });
  });

  it('records an audit log entry for snapshot downloads', async () => {
    const snapshot = await service.createSnapshot('user_1', 'project_1', {
      captureSource: 'API',
      archive: {
        fileName: 'project.zip',
        contentType: 'application/zip',
        base64Data: archiveBase64,
        sizeBytes: archiveBuffer.byteLength,
      },
    });

    await service.downloadSnapshotAsZip('user_1', 'project_1', snapshot.id);

    expect(repository.auditLogs.some((entry) => entry.action === 'SNAPSHOT_DOWNLOADED')).toBe(true);
  });
});

describe('snapshot lifecycle transitions', () => {
  it('allows valid transitions and blocks invalid ones', () => {
    expect(() => assertSnapshotTransition('PENDING', 'PROCESSING')).not.toThrow();
    expect(() => assertSnapshotTransition('PROCESSING', 'COMPLETED')).not.toThrow();
    expect(() => assertSnapshotTransition('COMPLETED', 'PROCESSING')).toThrowError(HttpError);
  });
});
