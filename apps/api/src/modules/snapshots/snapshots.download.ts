import { Buffer } from 'node:buffer';
import type { Readable } from 'node:stream';

import yauzl from 'yauzl';
import yazl from 'yazl';

import { HttpError } from '../../core/errors/http-error.js';
import { maskSecretValue } from '../secrets/secrets.crypto.js';
import { detectSecretsFromArchive } from '../secrets/secrets.detection.js';
import { isEnvFilePath, shouldFullyMaskValue, shouldMaskForSnapshot } from '../secrets/secrets.protection-policy.js';

const MAX_SANITIZE_FILE_BYTES = 2 * 1024 * 1024;

const ENV_ASSIGNMENT_PATTERN = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.+)$/gm;

function isLikelyBinaryBuffer(buffer: Buffer) {
  if (buffer.byteLength === 0) {
    return false;
  }

  let nonText = 0;
  for (const byte of buffer) {
    if (byte === 9 || byte === 10 || byte === 13) {
      continue;
    }

    if (byte === 0 || byte < 32 || byte > 126) {
      nonText += 1;
    }
  }

  return nonText / buffer.byteLength > 0.3;
}

export function maskEnvAssignments(content: string) {
  let redactionApplied = false;

  const output = content.replace(ENV_ASSIGNMENT_PATTERN, (line, prefix, key, separator, rawValue) => {
    const normalizedValue = String(rawValue).trim().replace(/^['"]|['"]$/g, '');

    if (normalizedValue.length === 0) {
      return line as string;
    }

    if (!shouldMaskForSnapshot({ key: String(key), value: normalizedValue })) {
      return line as string;
    }

    const masked = shouldFullyMaskValue({ key: String(key), value: normalizedValue })
      ? '*'.repeat(Math.max(normalizedValue.length, 8))
      : maskSecretValue(normalizedValue);

    redactionApplied = true;
    return `${String(prefix)}${String(key)}${String(separator)}${masked}`;
  });

  return { content: output, redactionApplied };
}

export function sanitizeFileContentForDownload(options: {
  filePath: string;
  content: string;
  detectedValuesByPath: Map<string, string[]>;
  globalDetectedValues: string[];
}) {
  let output = options.content;
  let redactionApplied = false;

  if (isEnvFilePath(options.filePath)) {
    const masked = maskEnvAssignments(output);
    output = masked.content;
    redactionApplied = redactionApplied || masked.redactionApplied;
  }

  const fileValues = options.detectedValuesByPath.get(options.filePath) ?? [];
  const candidates = [...new Set([...fileValues, ...options.globalDetectedValues])]
    .filter((value) => value.length >= 8)
    .sort((left, right) => right.length - left.length);

  for (const value of candidates) {
    if (!output.includes(value)) {
      continue;
    }

    output = output.split(value).join(maskSecretValue(value));
    redactionApplied = true;
  }

  return { content: output, redactionApplied };
}

type ZipEntryPayload = {
  path: string;
  isDirectory: boolean;
  buffer: Buffer;
};

function readZipEntries(archiveBuffer: Buffer): Promise<ZipEntryPayload[]> {
  return new Promise((resolve, reject) => {
    const fail = (error: unknown) => {
      reject(
        error instanceof HttpError
          ? error
          : new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Invalid ZIP archive'),
      );
    };

    yauzl.fromBuffer(archiveBuffer, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        fail(openError);
        return;
      }

      const entries: ZipEntryPayload[] = [];

      zipFile.on('error', (zipError) => {
        zipFile.close();
        fail(zipError);
      });

      zipFile.on('entry', (entry) => {
        const entryPath = String(entry.fileName);

        if (entryPath.includes('\u0000') || entryPath.startsWith('/') || entryPath.includes('..')) {
          zipFile.close();
          fail(new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Snapshot archive contains an unsafe entry path'));
          return;
        }

        if (entryPath.endsWith('/')) {
          entries.push({ path: entryPath, isDirectory: true, buffer: Buffer.alloc(0) });
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            zipFile.close();
            fail(streamError);
            return;
          }

          const chunks: Buffer[] = [];
          const stream = readStream as unknown as Readable;

          stream.on('data', (chunk: Buffer) => {
            chunks.push(Buffer.from(chunk));
          });

          stream.on('error', (chunkError) => {
            zipFile.close();
            fail(chunkError);
          });

          stream.on('end', () => {
            entries.push({ path: entryPath, isDirectory: false, buffer: Buffer.concat(chunks) });
            zipFile.readEntry();
          });
        });
      });

      zipFile.on('end', () => {
        zipFile.close();
        resolve(entries);
      });

      zipFile.readEntry();
    });
  });
}

function buildZipBuffer(entries: ZipEntryPayload[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zipFile = new yazl.ZipFile();

    for (const entry of entries) {
      if (entry.isDirectory) {
        zipFile.addEmptyDirectory(entry.path);
        continue;
      }

      zipFile.addBuffer(entry.buffer, entry.path);
    }

    zipFile.end();

    const chunks: Buffer[] = [];
    const output = zipFile.outputStream as unknown as Readable;

    output.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });

    output.on('error', (error) => {
      reject(
        error instanceof HttpError
          ? error
          : new HttpError(500, 'SNAPSHOT_DOWNLOAD_FAILED', 'Failed to build snapshot archive'),
      );
    });

    output.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function buildSanitizedSnapshotZip(options: {
  archiveBuffer: Buffer;
  maxPathLength: number;
}): Promise<{ buffer: Buffer; sanitizedFileCount: number; totalFileCount: number }> {
  const entries = await readZipEntries(options.archiveBuffer);

  const detections = await detectSecretsFromArchive({
    archiveBuffer: options.archiveBuffer,
    maxPathLength: options.maxPathLength,
  });

  const detectedValuesByPath = new Map<string, string[]>();
  const globalDetectedValues: string[] = [];

  for (const detection of detections) {
    const rawValue = detection.rawValue;
    if (typeof rawValue !== 'string' || rawValue.length < 8) {
      continue;
    }

    const current = detectedValuesByPath.get(detection.sourceFilePath) ?? [];
    current.push(rawValue);
    detectedValuesByPath.set(detection.sourceFilePath, current);
    globalDetectedValues.push(rawValue);
  }

  const uniqueGlobalValues = [...new Set(globalDetectedValues)];

  let sanitizedFileCount = 0;
  let totalFileCount = 0;

  const sanitizedEntries: ZipEntryPayload[] = entries.map((entry) => {
    if (entry.isDirectory) {
      return entry;
    }

    totalFileCount += 1;

    if (entry.buffer.byteLength > MAX_SANITIZE_FILE_BYTES || isLikelyBinaryBuffer(entry.buffer)) {
      return entry;
    }

    const originalContent = entry.buffer.toString('utf8');
    const result = sanitizeFileContentForDownload({
      filePath: entry.path,
      content: originalContent,
      detectedValuesByPath,
      globalDetectedValues: uniqueGlobalValues,
    });

    if (!result.redactionApplied) {
      return entry;
    }

    sanitizedFileCount += 1;
    return {
      path: entry.path,
      isDirectory: false,
      buffer: Buffer.from(result.content, 'utf8'),
    };
  });

  const buffer = await buildZipBuffer(sanitizedEntries);

  return { buffer, sanitizedFileCount, totalFileCount };
}

export function buildSnapshotDownloadFileName(projectName: string | null, snapshotId: string) {
  const safeProjectName = (projectName ?? 'project')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  const safeSnapshotId = snapshotId.replace(/[^a-zA-Z0-9-_]+/g, '').slice(0, 40);

  return `${safeProjectName || 'project'}_snapshot_${safeSnapshotId || 'archive'}.zip`;
}
