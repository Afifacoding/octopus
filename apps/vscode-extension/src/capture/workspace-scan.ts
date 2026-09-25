import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type * as vscode from 'vscode';

import type { CaptureEntry, CaptureRoot, CapturedFile, WorkspaceScanResult } from './types';
import type { ExclusionMatcher } from './exclusions';

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, '/');
}

export async function scanWorkspace(options: {
  roots: CaptureRoot[];
  exclusionMatcher: ExclusionMatcher;
  maxFiles: number;
  maxDirectories: number;
  maxTotalBytes: number;
  cancellationToken?: vscode.CancellationToken;
}): Promise<WorkspaceScanResult> {
  const files: CapturedFile[] = [];
  const entries: CaptureEntry[] = [];
  const excludedPaths: string[] = [];
  const skippedUnreadablePaths: string[] = [];

  let fileCount = 0;
  let directoryCount = 0;
  let totalSizeBytes = 0;

  for (const root of options.roots) {
    const pendingDirs: Array<{ absolutePath: string; relativePath: string }> = [
      {
        absolutePath: root.fsPath,
        relativePath: root.name,
      },
    ];

    while (pendingDirs.length > 0) {
      if (options.cancellationToken?.isCancellationRequested) {
        throw new Error('Capture cancelled');
      }

      const current = pendingDirs.pop();
      if (!current) {
        continue;
      }

      const children = await readdir(current.absolutePath, { withFileTypes: true });

      for (const child of children) {
        const absolutePath = path.join(current.absolutePath, child.name);
        const relativePath = normalizeRelativePath(path.join(current.relativePath, child.name));

        if (options.exclusionMatcher.shouldExcludePath(relativePath)) {
          excludedPaths.push(relativePath);
          continue;
        }

        if (child.isDirectory()) {
          directoryCount += 1;
          if (directoryCount > options.maxDirectories) {
            throw new Error('Directory limit exceeded');
          }

          entries.push({
            path: relativePath,
            type: 'DIRECTORY',
          });

          pendingDirs.push({
            absolutePath,
            relativePath,
          });
          continue;
        }

        if (!child.isFile()) {
          continue;
        }

        fileCount += 1;
        if (fileCount > options.maxFiles) {
          throw new Error('File limit exceeded');
        }

        try {
          await access(absolutePath);
          const fileStat = await stat(absolutePath);

          totalSizeBytes += fileStat.size;
          if (totalSizeBytes > options.maxTotalBytes) {
            throw new Error('Workspace size limit exceeded');
          }

          files.push({
            absolutePath,
            relativePath,
            sizeBytes: fileStat.size,
          });

          entries.push({
            path: relativePath,
            type: 'FILE',
          });
        } catch {
          skippedUnreadablePaths.push(relativePath);
        }
      }
    }
  }

  return {
    files,
    entries,
    fileCount,
    directoryCount,
    totalSizeBytes,
    excludedPaths,
    skippedUnreadablePaths,
  };
}
