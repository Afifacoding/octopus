import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type * as vscode from 'vscode';

import type { CapturedFile } from './types';
import { CaptureCancelledError } from './workspace-scan';

export type PreparedArchive = {
  archivePath: string;
  tempDir: string;
  sizeBytes: number;
  entryCount: number;
  warnings: string[];
};

export type ArchiveProgress = {
  processedEntries: number;
  totalEntries: number;
  processedBytes: number;
  totalBytes: number;
};

type ArchiverProgressEvent = {
  entries: { total: number; processed: number };
  fs: { totalBytes: number; processedBytes: number };
};

const CANCELLATION_POLL_MS = 100;

export async function packageWorkspaceAsZip(options: {
  files: CapturedFile[];
  cancellationToken?: vscode.CancellationToken;
  onProgress?: (progress: ArchiveProgress) => void;
}): Promise<PreparedArchive> {
  const archiverModule = await import('archiver');
  const archiverExport = archiverModule as unknown as { default?: unknown };
  const createArchive = (archiverExport.default ?? archiverModule) as unknown as (
    format: 'zip',
    options: { zlib: { level: number } },
  ) => {
    pipe: (target: NodeJS.WritableStream) => void;
    file: (filePath: string, options: { name: string }) => void;
    finalize: () => Promise<void>;
    abort: () => void;
    on(event: 'error' | 'warning', listener: (error: Error) => void): void;
    on(event: 'progress', listener: (progress: ArchiverProgressEvent) => void): void;
  };

  if (options.cancellationToken?.isCancellationRequested) {
    throw new CaptureCancelledError();
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'octopus-capture-'));
  const archivePath = path.join(tempDir, `${randomUUID()}.zip`);
  const warnings: string[] = [];
  const totalBytes = options.files.reduce((sum, file) => sum + file.sizeBytes, 0);
  let cancellationPoll: NodeJS.Timeout | undefined;

  try {
    await mkdir(path.dirname(archivePath), { recursive: true });

    const output = createWriteStream(archivePath);
    const archive = createArchive('zip', { zlib: { level: 1 } });

    const completed = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });

    const cancelled = new Promise<never>((_resolve, reject) => {
      cancellationPoll = setInterval(() => {
        if (options.cancellationToken?.isCancellationRequested) {
          reject(new CaptureCancelledError());
        }
      }, CANCELLATION_POLL_MS);
    });

    // Prevent unhandled rejections for whichever promise loses the race below.
    completed.catch(() => undefined);
    cancelled.catch(() => undefined);

    archive.on('warning', (warning) => {
      warnings.push(warning.message);
    });

    let packagedEntries: number | null = null;
    archive.on('progress', (event) => {
      packagedEntries = event.entries.processed;
      options.onProgress?.({
        processedEntries: event.entries.processed,
        totalEntries: event.entries.total,
        processedBytes: event.fs.processedBytes,
        totalBytes,
      });
    });

    archive.pipe(output);

    for (const file of options.files) {
      if (options.cancellationToken?.isCancellationRequested) {
        archive.abort();
        output.destroy();
        throw new CaptureCancelledError();
      }

      archive.file(file.absolutePath, { name: file.relativePath });
    }

    const finalized = archive.finalize();
    finalized.catch(() => undefined);

    try {
      await Promise.race([Promise.all([finalized, completed]), cancelled]);
    } catch (error) {
      archive.abort();
      output.destroy();
      throw error;
    }

    const archiveStat = await stat(archivePath);

    return {
      archivePath,
      tempDir,
      sizeBytes: archiveStat.size,
      entryCount: packagedEntries ?? options.files.length,
      warnings,
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    if (cancellationPoll) {
      clearInterval(cancellationPoll);
    }
  }
}

export async function cleanupTemporaryArchive(tempDir: string) {
  await rm(tempDir, { recursive: true, force: true });
}
