import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { cleanupTemporaryArchive, packageWorkspaceAsZip } from './archive';

describe('workspace archive packaging', () => {
  it('creates zip archive from relative paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-archive-'));

    try {
      await mkdir(path.join(root, 'src'), { recursive: true });
      const filePath = path.join(root, 'src', 'index.ts');
      await writeFile(filePath, 'console.log("ok");');

      const packaged = await packageWorkspaceAsZip({
        files: [
          {
            absolutePath: filePath,
            relativePath: 'workspace/src/index.ts',
            sizeBytes: 18,
          },
        ],
      });

      expect(packaged.sizeBytes).toBeGreaterThan(0);
      expect(packaged.archivePath).toMatch(/\.zip$/u);

      await cleanupTemporaryArchive(packaged.tempDir);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports packaging progress and entry count', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-archive-progress-'));

    try {
      const files = [];
      for (let index = 0; index < 25; index += 1) {
        const filePath = path.join(root, `file-${index}.ts`);
        await writeFile(filePath, `export const v = ${index};`.repeat(50));
        files.push({ absolutePath: filePath, relativePath: `workspace/file-${index}.ts`, sizeBytes: 0 });
      }

      const progressEvents: number[] = [];
      const packaged = await packageWorkspaceAsZip({
        files,
        onProgress(progress) {
          progressEvents.push(progress.processedEntries);
        },
      });

      expect(packaged.entryCount).toBe(25);
      expect(packaged.warnings).toEqual([]);
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.at(-1)).toBe(25);

      await cleanupTemporaryArchive(packaged.tempDir);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('aborts and removes its temporary directory when cancelled during compression', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-archive-cancel-'));

    try {
      const files = [];
      for (let index = 0; index < 40; index += 1) {
        const filePath = path.join(root, `blob-${index}.bin`);
        await writeFile(filePath, randomBytes(256 * 1024));
        files.push({ absolutePath: filePath, relativePath: `workspace/blob-${index}.bin`, sizeBytes: 256 * 1024 });
      }

      const before = new Set(await listSnapshotTempDirs());
      const token = { isCancellationRequested: false };

      const result = packageWorkspaceAsZip({
        files,
        cancellationToken: token as never,
        onProgress() {
          token.isCancellationRequested = true;
        },
      });

      await expect(result).rejects.toMatchObject({ name: 'CaptureCancelledError' });
      const leaked = (await listSnapshotTempDirs()).filter((dir) => !before.has(dir));
      expect(leaked).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function listSnapshotTempDirs() {
  const entries = await readdir(os.tmpdir());
  return entries.filter((entry) => entry.startsWith('octopus-capture-'));
}
