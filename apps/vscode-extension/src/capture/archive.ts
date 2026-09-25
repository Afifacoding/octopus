import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type * as vscode from 'vscode';

import type { CapturedFile } from './types';

export type PreparedArchive = {
  archivePath: string;
  tempDir: string;
  sizeBytes: number;
  base64Data: string;
};

export async function packageWorkspaceAsZip(options: {
  files: CapturedFile[];
  cancellationToken?: vscode.CancellationToken;
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
    on: (event: 'error', listener: (error: Error) => void) => void;
  };

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'octopus-capture-'));
  const archivePath = path.join(tempDir, `${randomUUID()}.zip`);

  await mkdir(path.dirname(archivePath), { recursive: true });

  const output = createWriteStream(archivePath);
  const archive = createArchive('zip', { zlib: { level: 9 } });

  const completed = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);

  for (const file of options.files) {
    if (options.cancellationToken?.isCancellationRequested) {
      archive.abort();
      throw new Error('Capture cancelled');
    }

    archive.file(file.absolutePath, { name: file.relativePath });
  }

  await archive.finalize();
  await completed;

  const archiveStat = await stat(archivePath);
  const buffer = await readFile(archivePath);

  return {
    archivePath,
    tempDir,
    sizeBytes: archiveStat.size,
    base64Data: buffer.toString('base64'),
  };
}

export async function cleanupTemporaryArchive(tempDir: string) {
  await rm(tempDir, { recursive: true, force: true });
}
