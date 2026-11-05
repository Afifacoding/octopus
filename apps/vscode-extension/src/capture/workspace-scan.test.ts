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
      expect(result.files.some((file) => file.relativePath === 'workspace/src/pages/home.tsx')).toBe(true);
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

  it('fails capture when the workspace byte limit is exceeded instead of skipping the file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-scan-size-'));

    try {
      await writeFile(path.join(root, 'large.txt'), '0123456789');

      await expect(
        scanWorkspace({
          roots: [{ name: 'workspace', fsPath: root }],
          exclusionMatcher: createExclusionMatcher({ customPatterns: [] }),
          maxFiles: 50,
          maxDirectories: 50,
          maxTotalBytes: 5,
        }),
      ).rejects.toThrow('Workspace size limit exceeded (10 bytes). Limit: 5 bytes.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prunes heavy dependency/build/cache folders in a large workspace without descending into them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-scan-large-'));

    try {
      const sourceFileCount = 600;
      for (let dirIndex = 0; dirIndex < 20; dirIndex += 1) {
        const dir = path.join(root, 'src', `module-${dirIndex}`);
        await mkdir(dir, { recursive: true });
        await Promise.all(
          Array.from({ length: sourceFileCount / 20 }, (_, fileIndex) =>
            writeFile(path.join(dir, `file-${fileIndex}.ts`), `export const value${fileIndex} = ${fileIndex};`),
          ),
        );
      }

      const heavyDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];
      for (const heavy of heavyDirs) {
        const nested = path.join(root, heavy, 'deep', 'nested');
        await mkdir(nested, { recursive: true });
        await Promise.all(
          Array.from({ length: 50 }, (_, index) => writeFile(path.join(nested, `f-${index}.js`), 'x')),
        );
      }
      await mkdir(path.join(root, 'packages', 'app', 'node_modules', 'react'), { recursive: true });
      await writeFile(path.join(root, 'packages', 'app', 'node_modules', 'react', 'index.js'), 'x');
      await writeFile(path.join(root, 'packages', 'app', 'index.ts'), 'export {};');
      await writeFile(path.join(root, '.env'), 'API_KEY=secret');
      await writeFile(path.join(root, 'package.json'), '{}');

      const progressEvents: number[] = [];
      const result = await scanWorkspace({
        roots: [{ name: 'workspace', fsPath: root }],
        exclusionMatcher: createExclusionMatcher({ customPatterns: [], excludeSensitiveFiles: false }),
        maxFiles: 5000,
        maxDirectories: 500,
        maxTotalBytes: 10_000_000,
        onProgress(progress) {
          progressEvents.push(progress.filesDiscovered);
        },
      });

      const relativePaths = result.files.map((file) => file.relativePath);
      expect(result.fileCount).toBe(sourceFileCount + 3);
      expect(relativePaths).toContain('workspace/.env');
      expect(relativePaths).toContain('workspace/package.json');
      expect(relativePaths).toContain('workspace/packages/app/index.ts');
      expect(relativePaths.some((item) => /node_modules|\.git\/|dist\/|build\/|\.next\//u.test(item))).toBe(false);

      for (const heavy of heavyDirs) {
        expect(result.excludedPaths).toContain(`workspace/${heavy}`);
      }
      expect(result.excludedPaths).toContain('workspace/packages/app/node_modules');
      // Pruned directories are never read, so none of their children appear in the excluded list.
      expect(result.excludedPaths.some((item) => item.includes('/deep/'))).toBe(false);
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.at(-1)).toBe(sourceFileCount + 3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stops with a cancellation error when the token is cancelled', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'octopus-scan-cancel-'));

    try {
      await mkdir(path.join(root, 'src'), { recursive: true });
      await writeFile(path.join(root, 'src', 'a.ts'), 'a');

      await expect(
        scanWorkspace({
          roots: [{ name: 'workspace', fsPath: root }],
          exclusionMatcher: createExclusionMatcher({ customPatterns: [], excludeSensitiveFiles: false }),
          maxFiles: 50,
          maxDirectories: 50,
          maxTotalBytes: 100000,
          cancellationToken: { isCancellationRequested: true } as never,
        }),
      ).rejects.toMatchObject({ name: 'CaptureCancelledError', message: 'Capture cancelled' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails when the workspace root itself cannot be read', async () => {
    await expect(
      scanWorkspace({
        roots: [{ name: 'workspace', fsPath: path.join(os.tmpdir(), `octopus-missing-${Date.now()}`) }],
        exclusionMatcher: createExclusionMatcher({ customPatterns: [], excludeSensitiveFiles: false }),
        maxFiles: 50,
        maxDirectories: 50,
        maxTotalBytes: 100000,
      }),
    ).rejects.toThrow();
  });
});
