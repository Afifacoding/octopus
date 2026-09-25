import { describe, expect, it } from 'vitest';

import { LocalSnapshotStorage } from './snapshots.storage.js';

describe('LocalSnapshotStorage', () => {
  it('stores archive with integrity hash', async () => {
    const storage = new LocalSnapshotStorage();
    const buffer = Buffer.from('snapshot-archive');

    const result = await storage.storeArchive({
      ownerId: 'user_1',
      projectId: 'project_1',
      snapshotId: 'snapshot_1',
      buffer,
      contentType: 'application/zip',
    });

    expect(result.storageKey).toContain('user_1/project_1/snapshot_1');
    expect(result.sizeBytes).toBe(buffer.byteLength);
    expect(result.integrityAlgorithm).toBe('sha256');
    expect(result.integrityHash.length).toBe(64);

    const stored = await storage.readArchive(result.storageKey);
    expect(stored.byteLength).toBe(buffer.byteLength);

    await storage.deleteArchive(result.storageKey);
  });

  it('rejects unsafe storage key deletes', async () => {
    const storage = new LocalSnapshotStorage();

    await expect(storage.deleteArchive('../escape')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });

    await expect(storage.deleteArchive('/absolute/path')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });

    await expect(storage.deleteArchive('C:/windows/system32')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });
  });
});
