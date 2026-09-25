import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
      expect(packaged.base64Data.length).toBeGreaterThan(0);

      await cleanupTemporaryArchive(packaged.tempDir);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
