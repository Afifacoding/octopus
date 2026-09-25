import { Buffer } from 'node:buffer';
import path from 'node:path';

import yauzl from 'yauzl';

import { env } from '../../config/env.js';
import { HttpError } from '../../core/errors/http-error.js';
import { assertSafeRelativePath } from '../../core/security/secure-file-path.js';
import { maskSecretValue } from '../secrets/secrets.crypto.js';
import { detectSecretsFromArchive } from '../secrets/secrets.detection.js';
import { isEnvFilePath, shouldFullyMaskValue, shouldMaskForSnapshot } from '../secrets/secrets.protection-policy.js';
import type { SecretsService } from '../secrets/secrets.service.js';
import { analyzeBlueprintFromSnapshot } from './snapshots.blueprint.js';
import { assertBlueprintTransition } from './snapshots.blueprint.lifecycle.js';
import { buildDirectoryTreeFromZip } from './snapshots.directory-tree.js';
import { buildSanitizedSnapshotZip, buildSnapshotDownloadFileName } from './snapshots.download.js';
import { assertSnapshotTransition } from './snapshots.lifecycle.js';
import { SnapshotsRepository } from './snapshots.repository.js';
import {
  allowedArchiveContentTypes,
  type SnapshotStorage,
  type StoreSnapshotArchiveResult,
} from './snapshots.storage.js';
import type {
  BlueprintRecord,
  PublicSnapshot,
  SnapshotArchiveEntry,
  SnapshotBlueprintResponse,
  SnapshotCreateInput,
  SnapshotDirectoryTree,
  SnapshotDirectoryTreeResponse,
  SnapshotFileContentResponse,
} from './snapshots.types.js';

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
  captureMetadata: unknown;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type BlueprintDbRecord = {
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

type SnapshotWithBlueprintRecord = SnapshotRecord & {
  blueprint: BlueprintDbRecord | null;
};

type ZipFileLookupResult =
  | {
      kind: 'FILE';
      sizeBytes: number;
      buffer: Buffer;
      truncated: boolean;
    }
  | {
      kind: 'FILE_TOO_LARGE';
      sizeBytes: number;
    }
  | {
      kind: 'DIRECTORY';
    }
  | {
      kind: 'MISSING';
    };

const MAX_FILE_PREVIEW_BYTES = 256 * 1024;

const likelyBinaryExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.7z',
  '.rar',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.exe',
  '.dll',
  '.so',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);

const knownTextContentTypes = new Set([
  'text/plain',
  'text/markdown',
  'text/x-python',
  'text/x-java-source',
  'text/x-go',
  'text/x-rustsrc',
  'text/x-shellscript',
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/javascript',
  'application/typescript',
]);

function normalizeSnapshotEntryPath(inputPath: string, maxPathLength: number) {
  if (inputPath.includes('\u0000')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot file path contains invalid characters');
  }

  if (/^[a-zA-Z]:/.test(inputPath) || inputPath.startsWith('/') || inputPath.startsWith('\\')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Absolute file paths are not allowed');
  }

  const normalized = assertSafeRelativePath(path.posix.normalize(inputPath.replace(/\\/g, '/')));
  if (normalized === '.' || normalized === '') {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot file path is invalid');
  }

  if (normalized.length > maxPathLength) {
    throw new HttpError(400, 'SNAPSHOT_ENTRY_PATH_TOO_LONG', 'Snapshot file path is too long');
  }

  return normalized;
}

function isLikelyBinary(buffer: Buffer) {
  if (buffer.byteLength === 0) {
    return false;
  }

  let nonText = 0;
  for (const byte of buffer) {
    if (byte === 9 || byte === 10 || byte === 13) {
      continue;
    }

    if (byte < 32 || byte > 126) {
      nonText += 1;
    }
  }

  return nonText / buffer.byteLength > 0.3;
}

function guessContentType(filePath: string) {
  const extension = path.posix.extname(filePath).toLowerCase();

  const byExtension: Record<string, string> = {
    '.ts': 'application/typescript',
    '.tsx': 'application/typescript',
    '.js': 'application/javascript',
    '.jsx': 'application/javascript',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.css': 'text/plain',
    '.scss': 'text/plain',
    '.html': 'text/plain',
    '.yml': 'application/yaml',
    '.yaml': 'application/yaml',
    '.xml': 'application/xml',
    '.env': 'text/plain',
    '.py': 'text/x-python',
    '.java': 'text/x-java-source',
    '.go': 'text/x-go',
    '.rs': 'text/x-rustsrc',
    '.sh': 'text/x-shellscript',
    '.sql': 'text/plain',
    '.toml': 'text/plain',
    '.ini': 'text/plain',
    '.conf': 'text/plain',
  };

  if (byExtension[extension]) {
    return byExtension[extension] as string;
  }

  const baseName = path.posix.basename(filePath).toLowerCase();
  if (baseName === 'dockerfile' || baseName === 'makefile' || baseName === '.env' || baseName.startsWith('.env.')) {
    return 'text/plain';
  }

  return null;
}

function isUnsupportedByType(filePath: string, contentTypeGuess: string | null) {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (likelyBinaryExtensions.has(extension)) {
    return true;
  }

  if (!contentTypeGuess) {
    return false;
  }

  if (contentTypeGuess.startsWith('image/')) {
    return true;
  }

  return !contentTypeGuess.startsWith('text/') && !knownTextContentTypes.has(contentTypeGuess);
}

function findZipFileEntryByPath(options: {
  archiveBuffer: Buffer;
  targetPath: string;
  maxPathLength: number;
  maxPreviewBytes: number;
}): Promise<ZipFileLookupResult> {
  return new Promise((resolve, reject) => {
    const fail = (error: unknown) => {
      reject(error instanceof HttpError ? error : new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Invalid ZIP archive'));
    };

    yauzl.fromBuffer(options.archiveBuffer, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        fail(openError);
        return;
      }

      const finish = (result: ZipFileLookupResult) => {
        zipFile.close();
        resolve(result);
      };

      zipFile.on('error', (zipError) => {
        zipFile.close();
        fail(zipError);
      });

      zipFile.on('entry', (entry) => {
        let normalizedPath = '';

        try {
          normalizedPath = normalizeSnapshotEntryPath(entry.fileName, options.maxPathLength);
        } catch (error) {
          zipFile.close();
          fail(error);
          return;
        }

        if (normalizedPath !== options.targetPath) {
          zipFile.readEntry();
          return;
        }

        if (entry.fileName.endsWith('/')) {
          finish({ kind: 'DIRECTORY' });
          return;
        }

        if (entry.uncompressedSize > options.maxPreviewBytes) {
          finish({ kind: 'FILE_TOO_LARGE', sizeBytes: entry.uncompressedSize });
          return;
        }

        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            zipFile.close();
            fail(streamError);
            return;
          }

          const chunks: Buffer[] = [];
          let bytesRead = 0;
          let truncated = false;

          readStream.on('data', (chunk: Buffer) => {
            bytesRead += chunk.byteLength;
            if (bytesRead > options.maxPreviewBytes) {
              truncated = true;
              readStream.destroy();
              return;
            }

            chunks.push(chunk);
          });

          readStream.on('error', (error) => {
            zipFile.close();
            fail(error);
          });

          readStream.on('close', () => {
            if (truncated) {
              finish({ kind: 'FILE_TOO_LARGE', sizeBytes: entry.uncompressedSize });
            }
          });

          readStream.on('end', () => {
            finish({
              kind: 'FILE',
              sizeBytes: entry.uncompressedSize,
              buffer: Buffer.concat(chunks),
              truncated,
            });
          });
        });
      });

      zipFile.on('end', () => {
        finish({ kind: 'MISSING' });
      });

      zipFile.readEntry();
    });
  });
}

async function maskDetectedSecretsInText(options: {
  archiveBuffer: Buffer;
  filePath: string;
  content: string;
  maxPathLength: number;
}) {
  let output = options.content;
  let redactionApplied = false;

  if (isEnvFilePath(options.filePath)) {
    output = output.replace(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.+)$/gm, (line, prefix, key, separator, rawValue) => {
      const normalizedValue = String(rawValue).trim().replace(/^['\"]|['\"]$/g, '');
      if (!shouldMaskForSnapshot({ key: String(key), value: normalizedValue })) {
        return line;
      }

      const masked = shouldFullyMaskValue({ key: String(key), value: normalizedValue })
        ? '*'.repeat(Math.max(normalizedValue.length, 8))
        : maskSecretValue(normalizedValue);
      redactionApplied = true;
      return `${String(prefix)}${String(key)}${String(separator)}${masked}`;
    });
  }

  const detections = await detectSecretsFromArchive({
    archiveBuffer: options.archiveBuffer,
    maxPathLength: options.maxPathLength,
  });

  const matches = detections.filter((item) => item.sourceFilePath === options.filePath);
  if (matches.length === 0) {
    return {
      content: output,
      redactionApplied,
    };
  }

  const values = [...new Set(matches.map((item) => item.rawValue).filter((item) => item.length >= 8))].sort(
    (left, right) => right.length - left.length,
  );

  if (values.length === 0) {
    return {
      content: output,
      redactionApplied,
    };
  }

  for (const value of values) {
    if (!output.includes(value)) {
      continue;
    }

    output = output.split(value).join(maskSecretValue(value));
    redactionApplied = true;
  }

  return {
    content: output,
    redactionApplied,
  };
}

export class SnapshotsService {
  constructor(
    private readonly repository: SnapshotsRepository,
    private readonly storage: SnapshotStorage,
    private readonly secretsService?: Pick<SecretsService, 'autoImportSnapshotSecrets'>,
  ) {}

  async createSnapshot(ownerId: string, projectId: string, input: SnapshotCreateInput) {
    await this.assertProjectOwnership(ownerId, projectId);
    this.assertSnapshotLimits(input);
    this.assertSnapshotEntries(input.entries);

    const snapshot = await this.repository.createSnapshot({
      projectId,
      status: 'PENDING',
      captureSource: input.captureSource,
      ...(input.clientName !== undefined ? { clientName: input.clientName } : {}),
      ...(input.clientVersion !== undefined ? { clientVersion: input.clientVersion } : {}),
      ...(input.fileCount !== undefined ? { fileCount: input.fileCount } : {}),
      ...(input.directoryCount !== undefined ? { directoryCount: input.directoryCount } : {}),
      ...(input.metadata !== undefined ? { captureMetadata: input.metadata } : {}),
      archiveContentType: input.archive.contentType,
      archiveSizeBytes: input.archive.sizeBytes,
    });

    try {
      await this.transitionStatus(projectId, snapshot.id, snapshot.status, 'PROCESSING');

      const archiveBuffer = this.decodeArchiveData(input.archive.base64Data, input.archive.sizeBytes);
      const storageResult = await this.storage.storeArchive({
        ownerId,
        projectId,
        snapshotId: snapshot.id,
        buffer: archiveBuffer,
        contentType: input.archive.contentType,
      });

      await this.completeSnapshot(ownerId, projectId, snapshot.id, input, storageResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Snapshot processing failed';

      await this.repository.updateSnapshot(projectId, snapshot.id, {
        status: 'FAILED',
        failureCode: error instanceof HttpError ? error.code : 'SNAPSHOT_PROCESSING_FAILED',
        failureReason: message.slice(0, 500),
        processedAt: new Date(),
      });

      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(500, 'SNAPSHOT_PROCESSING_FAILED', 'Snapshot processing failed');
    }

    const completed = await this.repository.findSnapshotByIdForProject(projectId, snapshot.id);
    if (!completed) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    return this.toPublicSnapshot(completed);
  }

  async listSnapshots(ownerId: string, projectId: string) {
    await this.assertProjectOwnership(ownerId, projectId);
    const snapshots = await this.repository.listSnapshotsByProject(projectId);

    return snapshots.map((snapshot: SnapshotRecord) => this.toPublicSnapshot(snapshot));
  }

  async getSnapshot(ownerId: string, projectId: string, snapshotId: string) {
    await this.assertProjectOwnership(ownerId, projectId);
    const snapshot = await this.repository.findSnapshotByIdForProject(projectId, snapshotId);

    if (!snapshot) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    return this.toPublicSnapshot(snapshot);
  }

  async getSnapshotDirectoryTree(
    ownerId: string,
    projectId: string,
    snapshotId: string,
  ): Promise<SnapshotDirectoryTreeResponse> {
    await this.assertProjectOwnership(ownerId, projectId);
    const snapshot = await this.repository.findSnapshotByIdForProject(projectId, snapshotId);

    if (!snapshot) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    const metadata = this.parseCaptureMetadata(snapshot.captureMetadata);
    const directoryTree = this.getDirectoryTreeFromMetadata(metadata);

    return {
      snapshotId: snapshot.id,
      status: snapshot.status,
      failureCode: snapshot.failureCode,
      failureReason: snapshot.failureReason,
      directoryTree,
    };
  }

  async getSnapshotFileContent(
    ownerId: string,
    projectId: string,
    snapshotId: string,
    filePath: string,
  ): Promise<SnapshotFileContentResponse> {
    await this.assertProjectOwnership(ownerId, projectId);
    const snapshot = await this.repository.findSnapshotByIdForProject(projectId, snapshotId);

    if (!snapshot) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    if (snapshot.status !== 'COMPLETED') {
      throw new HttpError(409, 'SNAPSHOT_NOT_READY', 'Snapshot must be completed before file preview');
    }

    if (!snapshot.archiveStorageKey) {
      throw new HttpError(400, 'SNAPSHOT_ARCHIVE_MISSING', 'Snapshot archive is missing');
    }

    if (snapshot.archiveContentType !== 'application/zip' && snapshot.archiveContentType !== 'application/x-zip-compressed') {
      throw new HttpError(
        400,
        'SNAPSHOT_ARCHIVE_UNSUPPORTED_FOR_PREVIEW',
        'Snapshot file preview currently supports ZIP archives only',
      );
    }

    const normalizedPath = normalizeSnapshotEntryPath(filePath, env.SNAPSHOT_MAX_PATH_LENGTH);
    const archiveBuffer = await this.storage.readArchive(snapshot.archiveStorageKey);
    const entry = await findZipFileEntryByPath({
      archiveBuffer,
      targetPath: normalizedPath,
      maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
      maxPreviewBytes: MAX_FILE_PREVIEW_BYTES,
    });

    if (entry.kind === 'MISSING') {
      throw new HttpError(404, 'SNAPSHOT_FILE_NOT_FOUND', 'Snapshot file not found');
    }

    if (entry.kind === 'DIRECTORY') {
      throw new HttpError(400, 'SNAPSHOT_FILE_NOT_PREVIEWABLE', 'Selected path is a directory');
    }

    const fileName = path.posix.basename(normalizedPath);
    const contentTypeGuess = guessContentType(normalizedPath);

    if (entry.kind === 'FILE_TOO_LARGE') {
      return {
        snapshotId: snapshot.id,
        status: snapshot.status,
        failureCode: snapshot.failureCode,
        failureReason: snapshot.failureReason,
        file: {
          path: normalizedPath,
          fileName,
          sizeBytes: entry.sizeBytes,
          contentTypeGuess,
          isText: false,
          supported: false,
          unsupportedReason: 'FILE_TOO_LARGE',
          redactionApplied: false,
          truncated: false,
          content: null,
        },
      };
    }

    if (isUnsupportedByType(normalizedPath, contentTypeGuess)) {
      return {
        snapshotId: snapshot.id,
        status: snapshot.status,
        failureCode: snapshot.failureCode,
        failureReason: snapshot.failureReason,
        file: {
          path: normalizedPath,
          fileName,
          sizeBytes: entry.sizeBytes,
          contentTypeGuess,
          isText: false,
          supported: false,
          unsupportedReason: 'UNSUPPORTED_FILE_TYPE',
          redactionApplied: false,
          truncated: false,
          content: null,
        },
      };
    }

    if (isLikelyBinary(entry.buffer)) {
      return {
        snapshotId: snapshot.id,
        status: snapshot.status,
        failureCode: snapshot.failureCode,
        failureReason: snapshot.failureReason,
        file: {
          path: normalizedPath,
          fileName,
          sizeBytes: entry.sizeBytes,
          contentTypeGuess,
          isText: false,
          supported: false,
          unsupportedReason: 'BINARY_FILE',
          redactionApplied: false,
          truncated: false,
          content: null,
        },
      };
    }

    const content = entry.buffer.toString('utf8');
    const redaction = await maskDetectedSecretsInText({
      archiveBuffer,
      filePath: normalizedPath,
      content,
      maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
    });

    return {
      snapshotId: snapshot.id,
      status: snapshot.status,
      failureCode: snapshot.failureCode,
      failureReason: snapshot.failureReason,
      file: {
        path: normalizedPath,
        fileName,
        sizeBytes: entry.sizeBytes,
        contentTypeGuess,
        isText: true,
        supported: true,
        unsupportedReason: null,
        redactionApplied: redaction.redactionApplied,
        truncated: entry.truncated,
        content: redaction.content,
      },
    };
  }

  async createSnapshotBlueprint(
    ownerId: string,
    projectId: string,
    snapshotId: string,
  ): Promise<SnapshotBlueprintResponse> {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    if (snapshot.blueprint) {
      return {
        snapshotId: snapshot.id,
        snapshotStatus: snapshot.status,
        blueprint: this.toPublicBlueprint(snapshot.blueprint),
      };
    }

    const created = await this.repository.createBlueprint({
      snapshotId: snapshot.id,
      status: 'PENDING',
      metadata: {
        processedStaticOnly: true,
      },
    });

    return {
      snapshotId: snapshot.id,
      snapshotStatus: snapshot.status,
      blueprint: this.toPublicBlueprint(created),
    };
  }

  async getSnapshotBlueprint(
    ownerId: string,
    projectId: string,
    snapshotId: string,
  ): Promise<SnapshotBlueprintResponse> {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    if (!snapshot.blueprint) {
      throw new HttpError(404, 'BLUEPRINT_NOT_FOUND', 'Blueprint not found');
    }

    return {
      snapshotId: snapshot.id,
      snapshotStatus: snapshot.status,
      blueprint: this.toPublicBlueprint(snapshot.blueprint),
    };
  }

  async processSnapshotBlueprint(
    ownerId: string,
    projectId: string,
    snapshotId: string,
  ): Promise<SnapshotBlueprintResponse> {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    if (snapshot.status !== 'COMPLETED') {
      throw new HttpError(409, 'SNAPSHOT_NOT_READY_FOR_BLUEPRINT', 'Snapshot must be completed before blueprint processing');
    }

    if (!snapshot.archiveStorageKey) {
      throw new HttpError(400, 'SNAPSHOT_ARCHIVE_MISSING', 'Snapshot archive is missing');
    }

    const blueprint = snapshot.blueprint
      ? snapshot.blueprint
      : await this.repository.createBlueprint({
          snapshotId: snapshot.id,
          status: 'PENDING',
          metadata: {
            processedStaticOnly: true,
          },
        });

    await this.transitionBlueprintStatus(blueprint.snapshotId, blueprint.status, 'PROCESSING');

    try {
      const archiveBuffer = await this.storage.readArchive(snapshot.archiveStorageKey);
      const metadata = this.parseCaptureMetadata(snapshot.captureMetadata);
      const directoryTree = this.getDirectoryTreeFromMetadata(metadata);

      const analysis = await analyzeBlueprintFromSnapshot({
        archiveBuffer,
        maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
        directoryTree,
      });

      await this.transitionBlueprintStatus(blueprint.snapshotId, 'PROCESSING', 'COMPLETED');

      await this.repository.updateBlueprintBySnapshotId(blueprint.snapshotId, {
        status: 'COMPLETED',
        projectType: analysis.projectType,
        detectedFrameworks: analysis.detectedFrameworks,
        detectedLanguages: analysis.detectedLanguages,
        importantConfigFiles: analysis.importantConfigFiles,
        dependencyMetadata: analysis.dependencyMetadata,
        entryPoints: analysis.entryPoints,
        detectedCommands: analysis.detectedCommands,
        environmentReferences: analysis.environmentReferences,
        summary: analysis.summary,
        failureCode: null,
        failureReason: null,
        processedAt: new Date(),
        metadata: analysis.metadata,
      });
    } catch (error) {
      const failureCode = error instanceof HttpError ? error.code : 'BLUEPRINT_PROCESSING_FAILED';
      const failureReason = error instanceof Error ? error.message.slice(0, 500) : 'Blueprint processing failed';

      await this.repository.updateBlueprintBySnapshotId(blueprint.snapshotId, {
        status: 'FAILED',
        failureCode,
        failureReason,
        processedAt: new Date(),
      });

      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(500, 'BLUEPRINT_PROCESSING_FAILED', 'Blueprint processing failed');
    }

    const persisted = await this.repository.findBlueprintBySnapshotId(projectId, snapshotId);
    if (!persisted) {
      throw new HttpError(500, 'BLUEPRINT_PROCESSING_FAILED', 'Blueprint was not persisted');
    }

    return {
      snapshotId,
      snapshotStatus: snapshot.status,
      blueprint: this.toPublicBlueprint(persisted),
    };
  }

  async deleteSnapshotBlueprint(ownerId: string, projectId: string, snapshotId: string) {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    if (!snapshot.blueprint) {
      throw new HttpError(404, 'BLUEPRINT_NOT_FOUND', 'Blueprint not found');
    }

    const deleted = await this.repository.deleteBlueprintBySnapshotId(projectId, snapshotId);
    if (deleted.count === 0) {
      throw new HttpError(404, 'BLUEPRINT_NOT_FOUND', 'Blueprint not found');
    }

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'BLUEPRINT_DELETED',
      metadata: {
        projectId,
        snapshotId,
      },
    });

    return {
      snapshotId,
      snapshotStatus: snapshot.status,
      blueprint: this.toPublicBlueprint(snapshot.blueprint),
    };
  }

  async downloadSnapshotAsZip(ownerId: string, projectId: string, snapshotId: string) {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    if (snapshot.status !== 'COMPLETED') {
      throw new HttpError(400, 'SNAPSHOT_NOT_READY', 'Snapshot must be in COMPLETED status to download');
    }

    if (!snapshot.archiveStorageKey) {
      throw new HttpError(500, 'SNAPSHOT_NO_ARCHIVE', 'Snapshot archive not found in storage');
    }

    const contentType = snapshot.archiveContentType ?? 'application/zip';
    if (contentType !== 'application/zip' && contentType !== 'application/x-zip-compressed') {
      throw new HttpError(
        400,
        'SNAPSHOT_ARCHIVE_UNSUPPORTED_FOR_DOWNLOAD',
        'Snapshot download currently supports ZIP archives only',
      );
    }

    let archiveBuffer: Buffer;
    try {
      archiveBuffer = await this.storage.readArchive(snapshot.archiveStorageKey);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(500, 'SNAPSHOT_DOWNLOAD_FAILED', 'Failed to read snapshot archive');
    }

    const sanitized = await buildSanitizedSnapshotZip({
      archiveBuffer,
      maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
    });

    const project = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    const projectName = (project as { name?: string | null } | null)?.name ?? null;

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SNAPSHOT_DOWNLOADED',
      metadata: {
        projectId,
        snapshotId,
        sanitizedFileCount: sanitized.sanitizedFileCount,
        totalFileCount: sanitized.totalFileCount,
      },
    });

    return {
      buffer: sanitized.buffer,
      contentType: 'application/zip',
      fileName: buildSnapshotDownloadFileName(projectName, snapshotId),
      sanitizedFileCount: sanitized.sanitizedFileCount,
      totalFileCount: sanitized.totalFileCount,
    };
  }

  async deleteSnapshot(ownerId: string, projectId: string, snapshotId: string) {
    const snapshot = await this.findAuthorizedSnapshot(ownerId, projectId, snapshotId);

    const result = await this.repository.deleteSnapshotWithDependencies(projectId, snapshotId);

    if (result.deletedCount === 0) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    if (snapshot.archiveStorageKey) {
      try {
        await this.storage.deleteArchive(snapshot.archiveStorageKey);
      } catch {
        await this.repository.createAuditLog({
          userId: ownerId,
          action: 'SNAPSHOT_DELETE_STORAGE_CLEANUP_FAILED',
          metadata: {
            projectId,
            snapshotId,
          },
        });

        throw new HttpError(500, 'SNAPSHOT_DELETED_STORAGE_CLEANUP_FAILED', 'Snapshot deleted but archive cleanup failed');
      }
    }

    await this.repository.createAuditLog({
      userId: ownerId,
      action: 'SNAPSHOT_DELETED',
      metadata: {
        projectId,
        snapshotId,
        blueprintsDeleted: result.blueprintsDeleted,
        detectionsDeleted: result.detectionsDeleted,
        sourceSnapshotRefsCleared: result.sourceSnapshotRefsCleared,
        sourceDetectionRefsCleared: result.sourceDetectionRefsCleared,
      },
    });

    return this.toPublicSnapshot(snapshot);
  }

  private async findAuthorizedSnapshot(ownerId: string, projectId: string, snapshotId: string) {
    const snapshot = await this.repository.findSnapshotByIdForOwner(ownerId, projectId, snapshotId);

    if (!snapshot) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    return snapshot as SnapshotWithBlueprintRecord;
  }

  private async assertProjectOwnership(ownerId: string, projectId: string) {
    const project = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }
  }

  private assertSnapshotLimits(input: SnapshotCreateInput) {
    if (!allowedArchiveContentTypes.has(input.archive.contentType)) {
      throw new HttpError(400, 'SNAPSHOT_UNSUPPORTED_ARCHIVE_TYPE', 'Unsupported archive content type');
    }

    if (input.archive.sizeBytes > env.SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES) {
      throw new HttpError(413, 'SNAPSHOT_ARCHIVE_TOO_LARGE', 'Snapshot archive exceeds size limit');
    }

    if (input.archive.sizeBytes > env.MAX_REQUEST_SIZE_BYTES) {
      throw new HttpError(413, 'SNAPSHOT_ARCHIVE_TOO_LARGE', 'Snapshot archive exceeds API body limits');
    }

    if (input.fileCount !== undefined && input.fileCount > env.SNAPSHOT_MAX_FILE_COUNT) {
      throw new HttpError(400, 'SNAPSHOT_TOO_MANY_FILES', 'Snapshot file count exceeds limit');
    }

    if (input.directoryCount !== undefined && input.directoryCount > env.SNAPSHOT_MAX_DIRECTORY_COUNT) {
      throw new HttpError(400, 'SNAPSHOT_TOO_MANY_DIRECTORIES', 'Snapshot directory count exceeds limit');
    }

    if (input.entries !== undefined) {
      if (input.entries.length > env.SNAPSHOT_MAX_FILE_COUNT + env.SNAPSHOT_MAX_DIRECTORY_COUNT) {
        throw new HttpError(400, 'SNAPSHOT_TOO_MANY_ENTRIES', 'Snapshot entry count exceeds limit');
      }
    }
  }

  private assertSnapshotEntries(entries: SnapshotArchiveEntry[] | undefined) {
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      if (entry.path.length > env.SNAPSHOT_MAX_PATH_LENGTH) {
        throw new HttpError(400, 'SNAPSHOT_ENTRY_PATH_TOO_LONG', 'Snapshot entry path is too long');
      }

      if (entry.path.includes('\u0000')) {
        throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot entry path contains invalid characters');
      }

      if (/^[a-zA-Z]:/.test(entry.path) || entry.path.startsWith('/')) {
        throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Absolute entry paths are not allowed');
      }

      const normalized = assertSafeRelativePath(entry.path);

      if (normalized === '.' || normalized === '') {
        throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot entry path is invalid');
      }
    }
  }

  private decodeArchiveData(base64Data: string, expectedSizeBytes: number) {
    const normalized = base64Data.trim();
    const buffer = Buffer.from(normalized, 'base64');

    if (buffer.byteLength === 0 || normalized.length === 0) {
      throw new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Snapshot archive data is invalid');
    }

    if (buffer.byteLength !== expectedSizeBytes) {
      throw new HttpError(400, 'SNAPSHOT_ARCHIVE_SIZE_MISMATCH', 'Snapshot archive size does not match payload');
    }

    if (buffer.byteLength > env.SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES) {
      throw new HttpError(413, 'SNAPSHOT_ARCHIVE_TOO_LARGE', 'Snapshot archive exceeds size limit');
    }

    return buffer;
  }

  private async completeSnapshot(
    ownerId: string,
    projectId: string,
    snapshotId: string,
    input: SnapshotCreateInput,
    storageResult: StoreSnapshotArchiveResult,
  ) {
    const processing = await this.repository.findSnapshotByIdForProject(projectId, snapshotId);
    if (!processing) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    const archiveBuffer = await this.storage.readArchive(storageResult.storageKey);
    const directoryTree = await this.buildSnapshotDirectoryTree(input.archive.contentType, archiveBuffer);

    if (this.secretsService) {
      await this.secretsService.autoImportSnapshotSecrets(ownerId, projectId, snapshotId, archiveBuffer);
    }

    const updatedMetadata = this.mergeCaptureMetadata(processing.captureMetadata, {
      directoryTree,
      processingSource: 'archive',
      processedAt: new Date().toISOString(),
    });

    await this.repository.updateSnapshot(projectId, snapshotId, {
      status: 'COMPLETED',
      archiveStorageKey: storageResult.storageKey,
      archiveContentType: input.archive.contentType,
      archiveSizeBytes: storageResult.sizeBytes,
      integrityAlgorithm: storageResult.integrityAlgorithm,
      integrityHash: storageResult.integrityHash,
      failureCode: null,
      failureReason: null,
      fileCount: directoryTree.totalFiles,
      directoryCount: directoryTree.totalDirectories,
      captureMetadata: updatedMetadata,
      processedAt: new Date(),
    });
  }

  private async transitionStatus(
    projectId: string,
    snapshotId: string,
    currentStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    nextStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  ) {
    assertSnapshotTransition(currentStatus, nextStatus);

    await this.repository.updateSnapshot(projectId, snapshotId, {
      status: nextStatus,
    });
  }

  private async transitionBlueprintStatus(
    snapshotId: string,
    currentStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    nextStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  ) {
    assertBlueprintTransition(currentStatus, nextStatus);

    await this.repository.updateBlueprintBySnapshotId(snapshotId, {
      status: nextStatus,
    });
  }

  private async buildSnapshotDirectoryTree(contentType: string, archiveBuffer: Buffer) {
    if (contentType !== 'application/zip' && contentType !== 'application/x-zip-compressed') {
      throw new HttpError(
        400,
        'SNAPSHOT_ARCHIVE_UNSUPPORTED_FOR_TREE',
        'Directory tree processing currently supports ZIP archives only',
      );
    }

    return buildDirectoryTreeFromZip({
      archiveBuffer,
      maxFiles: env.SNAPSHOT_MAX_FILE_COUNT,
      maxDirectories: env.SNAPSHOT_MAX_DIRECTORY_COUNT,
      maxEntries: env.SNAPSHOT_MAX_FILE_COUNT + env.SNAPSHOT_MAX_DIRECTORY_COUNT,
      maxPathLength: env.SNAPSHOT_MAX_PATH_LENGTH,
      maxTotalBytes: env.SNAPSHOT_MAX_TOTAL_BYTES,
    });
  }

  private parseCaptureMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private mergeCaptureMetadata(
    current: unknown,
    serverProcessed: Record<string, unknown>,
  ): Record<string, unknown> {
    const existing = this.parseCaptureMetadata(current) ?? {};

    return {
      ...existing,
      serverProcessed,
    };
  }

  private getDirectoryTreeFromMetadata(metadata: Record<string, unknown> | null): SnapshotDirectoryTree | null {
    if (!metadata) {
      return null;
    }

    const processed = metadata.serverProcessed;
    if (!processed || typeof processed !== 'object' || Array.isArray(processed)) {
      return null;
    }

    const candidate = (processed as Record<string, unknown>).directoryTree;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }

    return candidate as SnapshotDirectoryTree;
  }

  private toPublicSnapshot(snapshot: SnapshotRecord): PublicSnapshot {
    return {
      id: snapshot.id,
      projectId: snapshot.projectId,
      status: snapshot.status,
      captureSource: snapshot.captureSource,
      clientName: snapshot.clientName,
      clientVersion: snapshot.clientVersion,
      archiveStorageKey: snapshot.archiveStorageKey,
      archiveContentType: snapshot.archiveContentType,
      archiveSizeBytes: snapshot.archiveSizeBytes,
      fileCount: snapshot.fileCount,
      directoryCount: snapshot.directoryCount,
      integrityAlgorithm: snapshot.integrityAlgorithm,
      integrityHash: snapshot.integrityHash,
      failureCode: snapshot.failureCode,
      failureReason: snapshot.failureReason,
      captureMetadata: (snapshot.captureMetadata as Record<string, unknown> | null) ?? null,
      processedAt: snapshot.processedAt ? snapshot.processedAt.toISOString() : null,
      createdAt: snapshot.createdAt.toISOString(),
      updatedAt: snapshot.updatedAt.toISOString(),
    };
  }

  private parseJsonStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item) => typeof item === 'string');
  }

  private parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private toPublicBlueprint(blueprint: BlueprintDbRecord): BlueprintRecord {
    return {
      id: blueprint.id,
      snapshotId: blueprint.snapshotId,
      status: blueprint.status,
      projectType: blueprint.projectType,
      detectedFrameworks: this.parseJsonStringArray(blueprint.detectedFrameworks),
      detectedLanguages: this.parseJsonStringArray(blueprint.detectedLanguages),
      importantConfigFiles: this.parseJsonStringArray(blueprint.importantConfigFiles),
      dependencyMetadata: this.parseJsonObject(blueprint.dependencyMetadata),
      entryPoints: this.parseJsonStringArray(blueprint.entryPoints),
      detectedCommands: this.parseJsonStringArray(blueprint.detectedCommands),
      environmentReferences: this.parseJsonStringArray(blueprint.environmentReferences),
      summary: blueprint.summary,
      failureCode: blueprint.failureCode,
      failureReason: blueprint.failureReason,
      processedAt: blueprint.processedAt ? blueprint.processedAt.toISOString() : null,
      metadata: this.parseJsonObject(blueprint.metadata),
      createdAt: blueprint.createdAt.toISOString(),
      updatedAt: blueprint.updatedAt.toISOString(),
    };
  }
}
