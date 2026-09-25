import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../../config/env.js';
import { HttpError } from '../../core/errors/http-error.js';
import { assertSafeRelativePath } from '../../core/security/secure-file-path.js';

export type StoreSnapshotArchiveInput = {
  ownerId: string;
  projectId: string;
  snapshotId: string;
  buffer: Buffer;
  contentType: string;
};

export type StoreSnapshotArchiveResult = {
  storageKey: string;
  sizeBytes: number;
  integrityAlgorithm: 'sha256';
  integrityHash: string;
};

export interface SnapshotStorage {
  storeArchive(input: StoreSnapshotArchiveInput): Promise<StoreSnapshotArchiveResult>;
  deleteArchive(storageKey: string): Promise<void>;
  readArchive(storageKey: string): Promise<Buffer>;
}

const extensionByContentType: Record<string, string> = {
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/gzip': 'gz',
  'application/x-gzip': 'gz',
  'application/x-tar': 'tar',
  'application/octet-stream': 'bin',
};

export const allowedArchiveContentTypes = new Set(Object.keys(extensionByContentType));

export class LocalSnapshotStorage implements SnapshotStorage {
  private readonly rootDir = path.resolve(env.SNAPSHOT_STORAGE_LOCAL_ROOT);

  async storeArchive(input: StoreSnapshotArchiveInput): Promise<StoreSnapshotArchiveResult> {
    const fileExtension = extensionByContentType[input.contentType];
    if (!fileExtension) {
      throw new HttpError(400, 'SNAPSHOT_UNSUPPORTED_ARCHIVE_TYPE', 'Unsupported archive content type');
    }

    const relativeStorageKey = assertSafeRelativePath(
      `${input.ownerId}/${input.projectId}/${input.snapshotId}/project.${fileExtension}`,
    );

    const absolutePath = this.toSafeStoragePath(relativeStorageKey);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);

    const persisted = await readFile(absolutePath);
    const hash = createHash('sha256').update(persisted).digest('hex');

    return {
      storageKey: relativeStorageKey,
      sizeBytes: persisted.byteLength,
      integrityAlgorithm: 'sha256',
      integrityHash: hash,
    };
  }

  async deleteArchive(storageKey: string): Promise<void> {
    const safeStorageKey = assertSafeRelativePath(storageKey);
    const absolutePath = this.toSafeStoragePath(safeStorageKey);
    await rm(absolutePath, { force: true });
  }

  async readArchive(storageKey: string): Promise<Buffer> {
    const safeStorageKey = assertSafeRelativePath(storageKey);
    const absolutePath = this.toSafeStoragePath(safeStorageKey);
    return readFile(absolutePath);
  }

  private toSafeStoragePath(storageKey: string) {
    const resolved = path.resolve(this.rootDir, storageKey);
    const rootWithSep = `${this.rootDir}${path.sep}`;

    if (resolved !== this.rootDir && !resolved.startsWith(rootWithSep)) {
      throw new HttpError(400, 'UNSAFE_PATH', 'Path traversal attempt detected');
    }

    return resolved;
  }
}

export function createSnapshotStorage(): SnapshotStorage {
  if (env.SNAPSHOT_STORAGE_PROVIDER === 'local') {
    return new LocalSnapshotStorage();
  }

  throw new HttpError(500, 'SNAPSHOT_STORAGE_PROVIDER_INVALID', 'Unsupported snapshot storage provider');
}
