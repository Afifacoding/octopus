import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type * as vscode from 'vscode';

import type { CaptureRoot, CapturedFile, WorkspaceScanResult } from './types';
import type { ExclusionMatcher } from './exclusions';

export class CaptureCancelledError extends Error {
  constructor() {
    super('Capture cancelled');
    this.name = 'CaptureCancelledError';
  }
}

export type WorkspaceScanProgress = {
  filesDiscovered: number;
  directoriesScanned: number;
  excludedCount: number;
  totalSizeBytes: number;
  currentDirectory: string;
};

const STAT_BATCH_SIZE = 32;
const PROGRESS_INTERVAL_MS = 250;

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
  onProgress?: (progress: WorkspaceScanProgress) => void;
}): Promise<WorkspaceScanResult> {
  const files: CapturedFile[] = [];
  const excludedPaths: string[] = [];
  const skippedUnreadablePaths: string[] = [];

  let fileCount = 0;
  let directoryCount = 0;
  let directoriesScanned = 0;
  let totalSizeBytes = 0;
  let lastProgressAt = 0;

  const throwIfCancelled = () => {
    if (options.cancellationToken?.isCancellationRequested) {
      throw new CaptureCancelledError();
    }
  };

  const isExcludedDirectory = (relativePath: string) =>
    options.exclusionMatcher.shouldExcludeDirectory
      ? options.exclusionMatcher.shouldExcludeDirectory(relativePath)
      : options.exclusionMatcher.shouldExcludePath(relativePath);

  const reportProgress = (currentDirectory: string, force = false) => {
    if (!options.onProgress) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) {
      return;
    }

    lastProgressAt = now;
    options.onProgress({
      filesDiscovered: fileCount,
      directoriesScanned,
      excludedCount: excludedPaths.length,
      totalSizeBytes,
      currentDirectory,
    });
  };

  for (const root of options.roots) {
    const pendingDirs: Array<{ absolutePath: string; relativePath: string }> = [
      {
        absolutePath: root.fsPath,
        relativePath: root.name,
      },
    ];

    while (pendingDirs.length > 0) {
      throwIfCancelled();

      const current = pendingDirs.pop();
      if (!current) {
        continue;
      }

      let children;
      try {
        children = await readdir(current.absolutePath, { withFileTypes: true });
      } catch (error) {
        // The workspace root itself must be readable; nested unreadable folders are skipped and reported.
        if (current.absolutePath === root.fsPath) {
          throw error;
        }

        skippedUnreadablePaths.push(current.relativePath);
        continue;
      }

      directoriesScanned += 1;
      const pendingFiles: Array<{ absolutePath: string; relativePath: string }> = [];

      for (const child of children) {
        const absolutePath = path.join(current.absolutePath, child.name);
        const relativePath = normalizeRelativePath(path.join(current.relativePath, child.name));

        // Dirent.isDirectory() does not follow symlinks, which prevents symlink loops.
        if (child.isDirectory()) {
          if (isExcludedDirectory(relativePath)) {
            excludedPaths.push(relativePath);
            continue;
          }

          directoryCount += 1;
          if (directoryCount > options.maxDirectories) {
            throw new Error('Directory limit exceeded');
          }

          pendingDirs.push({
            absolutePath,
            relativePath,
          });
          continue;
        }

        if (options.exclusionMatcher.shouldExcludePath(relativePath)) {
          excludedPaths.push(relativePath);
          continue;
        }

        if (!child.isFile()) {
          continue;
        }

        fileCount += 1;
        if (fileCount > options.maxFiles) {
          throw new Error('File limit exceeded');
        }

        pendingFiles.push({ absolutePath, relativePath });
      }

      for (let index = 0; index < pendingFiles.length; index += STAT_BATCH_SIZE) {
        throwIfCancelled();

        const batch = pendingFiles.slice(index, index + STAT_BATCH_SIZE);
        const sizes = await Promise.all(
          batch.map(async (file) => {
            try {
              return (await stat(file.absolutePath)).size;
            } catch {
              return null;
            }
          }),
        );

        for (const [batchIndex, file] of batch.entries()) {
          const fileSize = sizes[batchIndex];
          if (fileSize === null || fileSize === undefined) {
            skippedUnreadablePaths.push(file.relativePath);
            continue;
          }

          totalSizeBytes += fileSize;
          if (totalSizeBytes > options.maxTotalBytes) {
            throw new Error(
              `Workspace size limit exceeded (${totalSizeBytes} bytes). Limit: ${options.maxTotalBytes} bytes.`,
            );
          }

          files.push({
            absolutePath: file.absolutePath,
            relativePath: file.relativePath,
            sizeBytes: fileSize,
          });
        }
      }

      reportProgress(current.relativePath);
    }
  }

  reportProgress('', true);

  return {
    files,
    fileCount,
    directoryCount,
    totalSizeBytes,
    excludedPaths,
    skippedUnreadablePaths,
  };
}
