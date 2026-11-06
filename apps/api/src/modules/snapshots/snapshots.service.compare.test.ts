import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import yazl from 'yazl';

import { HttpError } from '../../core/errors/http-error.js';
import { clearSnapshotManifestCache, SnapshotsService } from './snapshots.service.js';
import type { SnapshotStorage } from './snapshots.storage.js';

async function createZip(entries: Array<{ path: string; content: string }>) {
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

type TestSnapshot = {
  id: string;
  projectId: string;
  ownerId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  archive: Buffer | null;
  integrityHash?: string | null;
  archiveContentType?: string;
};

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function createHarness(snapshots: TestSnapshot[]) {
  const archives = new Map<string, Buffer>();
  const projects = new Map<string, string>([
    ['project-a', 'owner-1'],
    ['project-b', 'owner-1'],
    ['project-c', 'owner-2'],
  ]);

  const records = snapshots.map((snapshot, index) => {
    const storageKey = snapshot.archive ? `${snapshot.ownerId}/${snapshot.projectId}/${snapshot.id}/project.zip` : null;
    if (storageKey && snapshot.archive) archives.set(storageKey, snapshot.archive);

    return {
      ownerId: snapshot.ownerId,
      record: {
        id: snapshot.id,
        projectId: snapshot.projectId,
        status: snapshot.status,
        captureSource: 'EXTENSION' as const,
        clientName: null,
        clientVersion: null,
        archiveStorageKey: storageKey,
        archiveContentType: snapshot.archiveContentType ?? 'application/zip',
        archiveSizeBytes: snapshot.archive?.byteLength ?? null,
        fileCount: null,
        directoryCount: null,
        integrityAlgorithm: snapshot.archive ? 'sha256' : null,
        integrityHash: snapshot.integrityHash === undefined
          ? (snapshot.archive ? sha256(snapshot.archive) : null)
          : snapshot.integrityHash,
        failureCode: null,
        failureReason: null,
        captureMetadata: null,
        processedAt: null,
        createdAt: new Date(Date.UTC(2025, 0, index + 1)),
        updatedAt: new Date(Date.UTC(2025, 0, index + 1)),
        blueprint: null,
      },
    };
  });

  const repository = {
    findProjectByIdForOwner: vi.fn(async (ownerId: string, projectId: string) =>
      projects.get(projectId) === ownerId ? { id: projectId, name: projectId } : null,
    ),
    findSnapshotByIdForOwner: vi.fn(async (ownerId: string, projectId: string, snapshotId: string) =>
      records.find(
        (entry) => entry.ownerId === ownerId && entry.record.projectId === projectId && entry.record.id === snapshotId,
      )?.record ?? null,
    ),
  };

  const readArchive = vi.fn(async (storageKey: string) => {
    const archive = archives.get(storageKey);
    if (!archive) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    return archive;
  });

  const storage = { readArchive } as unknown as SnapshotStorage;
  const service = new SnapshotsService(repository as never, storage);
  return { service, readArchive, archives };
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as HttpError;
  }
  throw new Error('Expected promise to reject');
}

describe('SnapshotsService.compareSnapshots', () => {
  let baseArchive: Buffer;
  let targetArchive: Buffer;

  beforeEach(async () => {
    clearSnapshotManifestCache();
    baseArchive = await createZip([
      { path: 'src/app.ts', content: 'v1' },
      { path: 'src/remove.ts', content: 'bye' },
      { path: '.env', content: 'TOKEN=abc123-super-secret' },
    ]);
    targetArchive = await createZip([
      { path: 'src/app.ts', content: 'v2' },
      { path: 'src/add.ts', content: 'hi' },
      { path: '.env', content: 'TOKEN=abc123-super-secret' },
    ]);
  });

  it('compares two completed snapshots of the same owned project', async () => {
    const { service } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-2', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: targetArchive },
    ]);

    const result = await service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2');

    expect(result.base.id).toBe('snap-1');
    expect(result.target.id).toBe('snap-2');
    expect(result.summary).toMatchObject({ added: 1, modified: 1, deleted: 1, unchanged: 1 });
    expect(result.added[0]?.path).toBe('src/add.ts');
    expect(result.modified[0]?.path).toBe('src/app.ts');
    expect(result.deleted[0]?.path).toBe('src/remove.ts');
    expect(result.unchanged[0]).toMatchObject({ path: '.env', sensitive: true });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('abc123-super-secret');
    expect(serialized).not.toContain('archiveStorageKey');
    expect(serialized).not.toContain('integrityHash');
  });

  it('rejects comparing a snapshot with itself', async () => {
    const { service } = createHarness([]);
    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-1'));
    expect(error.code).toBe('SNAPSHOT_COMPARE_SAME');
  });

  it('prevents comparing snapshots from different projects', async () => {
    const { service, readArchive } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-b', projectId: 'project-b', ownerId: 'owner-1', status: 'COMPLETED', archive: targetArchive },
    ]);

    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-b'));

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('SNAPSHOT_NOT_FOUND');
    expect(readArchive).not.toHaveBeenCalled();
  });

  it('prevents comparing another user\'s snapshots', async () => {
    const { service, readArchive } = createHarness([
      { id: 'snap-x', projectId: 'project-c', ownerId: 'owner-2', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-y', projectId: 'project-c', ownerId: 'owner-2', status: 'COMPLETED', archive: targetArchive },
    ]);

    const error = await captureError(service.compareSnapshots('owner-1', 'project-c', 'snap-x', 'snap-y'));

    expect(error.code).toBe('PROJECT_NOT_FOUND');
    expect(readArchive).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown snapshot IDs', async () => {
    const { service } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
    ]);

    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'missing'));
    expect(error.code).toBe('SNAPSHOT_NOT_FOUND');
  });

  it('refuses failed or in-progress snapshots', async () => {
    const { service } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-2', projectId: 'project-a', ownerId: 'owner-1', status: 'FAILED', archive: null },
      { id: 'snap-3', projectId: 'project-a', ownerId: 'owner-1', status: 'PROCESSING', archive: null },
    ]);

    expect((await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2'))).code).toBe('SNAPSHOT_NOT_READY');
    expect((await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-3'))).code).toBe('SNAPSHOT_NOT_READY');
  });

  it('reports archives that are missing from storage', async () => {
    const { service, archives } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-2', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: targetArchive },
    ]);
    archives.clear();

    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2'));
    expect(error.statusCode).toBe(410);
    expect(error.code).toBe('SNAPSHOT_ARCHIVE_UNAVAILABLE');
  });

  it('rejects archives that fail the integrity check', async () => {
    const { service } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      {
        id: 'snap-2',
        projectId: 'project-a',
        ownerId: 'owner-1',
        status: 'COMPLETED',
        archive: targetArchive,
        integrityHash: 'f'.repeat(64),
      },
    ]);

    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2'));
    expect(error.code).toBe('SNAPSHOT_INTEGRITY_MISMATCH');
  });

  it('rejects corrupted archives whose stored hash matches the corrupted bytes', async () => {
    const corrupted = Buffer.from('not-a-zip');
    const { service } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-2', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: corrupted },
    ]);

    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2'));
    expect(error.code).toBe('SNAPSHOT_ARCHIVE_CORRUPTED');
  });

  it('maps decryption failures to a corrupted-archive error', async () => {
    const { service, readArchive } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-2', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: targetArchive },
    ]);
    readArchive.mockRejectedValueOnce(new HttpError(500, 'SNAPSHOT_ARCHIVE_DECRYPT_FAILED', 'bad tag'));

    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2'));
    expect(error.code).toBe('SNAPSHOT_ARCHIVE_CORRUPTED');
    expect(error.statusCode).toBe(422);
  });

  it('only accepts ZIP archives', async () => {
    const { service } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      {
        id: 'snap-2',
        projectId: 'project-a',
        ownerId: 'owner-1',
        status: 'COMPLETED',
        archive: targetArchive,
        archiveContentType: 'application/gzip',
      },
    ]);

    const error = await captureError(service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2'));
    expect(error.code).toBe('SNAPSHOT_ARCHIVE_UNSUPPORTED_FOR_COMPARISON');
  });

  it('reuses verified manifests for repeated comparisons', async () => {
    const { service, readArchive } = createHarness([
      { id: 'snap-1', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: baseArchive },
      { id: 'snap-2', projectId: 'project-a', ownerId: 'owner-1', status: 'COMPLETED', archive: targetArchive },
    ]);

    await service.compareSnapshots('owner-1', 'project-a', 'snap-1', 'snap-2');
    await service.compareSnapshots('owner-1', 'project-a', 'snap-2', 'snap-1');

    expect(readArchive).toHaveBeenCalledTimes(2);
  });
});
