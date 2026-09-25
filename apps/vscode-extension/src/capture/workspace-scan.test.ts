import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createExclusionMatcher } from './exclusions';
import { scanWorkspace } from './workspace-scan';

describe('workspace scan', () => {
  it('preserves nested directory structure and excludes configured paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-scan-'));

    try {
      await mkdir(path.join(root, 'src', 'pages'), { recursive: true });
      await mkdir(path.join(root, 'node_modules', 'lib'), { recursive: true });
      await writeFile(path.join(root, 'src', 'pages', 'home.tsx'), 'export const ok = true;');
      await writeFile(path.join(root, 'node_modules', 'lib', 'index.js'), 'skip');

      const result = await scanWorkspace({
        roots: [{ name: 'workspace', fsPath: root }],
        exclusionMatcher: createExclusionMatcher({ customPatterns: [], excludeSensitiveFiles: true }),
        maxFiles: 50,
        maxDirectories: 50,
        maxTotalBytes: 100000,
      });

      expect(result.fileCount).toBe(1);
      expect(result.entries.some((entry) => entry.path.includes('workspace/src/pages'))).toBe(true);
      expect(result.excludedPaths.some((item) => item.includes('node_modules'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enforces file limits', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-scan-limits-'));

    try {
      await writeFile(path.join(root, 'a.txt'), 'a');
      await writeFile(path.join(root, 'b.txt'), 'b');

      await expect(
        scanWorkspace({
          roots: [{ name: 'workspace', fsPath: root }],
          exclusionMatcher: createExclusionMatcher({ customPatterns: [], excludeSensitiveFiles: false }),
          maxFiles: 1,
          maxDirectories: 50,
          maxTotalBytes: 100000,
        }),
      ).rejects.toThrow('File limit exceeded');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
