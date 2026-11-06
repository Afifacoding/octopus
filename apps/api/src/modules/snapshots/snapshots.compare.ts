import { createHash } from 'node:crypto';

import yauzl from 'yauzl';

import { HttpError } from '../../core/errors/http-error.js';
import { isEnvFilePath } from '../secrets/secrets.protection-policy.js';
import { normalizeArchivePath } from './snapshots.directory-tree.js';

export type SnapshotManifestFile = {
  sizeBytes: number;
  sha256: string;
};

/**
 * Per-file content fingerprint derived from a snapshot archive. It is kept
 * server-side only; hashes and contents are never returned to clients.
 */
export type SnapshotManifest = {
  files: Map<string, SnapshotManifestFile>;
  fileCount: number;
  totalBytes: number;
};

export type BuildSnapshotManifestOptions = {
  archiveBuffer: Buffer;
  maxEntries: number;
  maxFiles: number;
  maxPathLength: number;
  maxTotalBytes: number;
};

export type SnapshotFileChangeStatus = 'ADDED' | 'MODIFIED' | 'DELETED' | 'UNCHANGED';

export type SnapshotFileChange = {
  path: string;
  status: SnapshotFileChangeStatus;
  baseSizeBytes: number | null;
  targetSizeBytes: number | null;
  sizeDeltaBytes: number;
  sensitive: boolean;
};

export type SnapshotDirectoryChangeSummary = {
  directory: string;
  added: number;
  modified: number;
  deleted: number;
  unchanged: number;
};

export type SnapshotComparisonSummary = {
  baseFileCount: number;
  targetFileCount: number;
  added: number;
  modified: number;
  deleted: number;
  unchanged: number;
  changed: number;
  baseTotalBytes: number;
  targetTotalBytes: number;
  netSizeDeltaBytes: number;
  sensitiveChanged: number;
};

export type SnapshotManifestComparison = {
  summary: SnapshotComparisonSummary;
  added: SnapshotFileChange[];
  modified: SnapshotFileChange[];
  deleted: SnapshotFileChange[];
  unchanged: SnapshotFileChange[];
  truncated: {
    added: boolean;
    modified: boolean;
    deleted: boolean;
    unchanged: boolean;
  };
  directories: SnapshotDirectoryChangeSummary[];
};

export const DEFAULT_COMPARISON_LIST_LIMIT = 500;
const MAX_DIRECTORY_SUMMARIES = 50;
const ROOT_DIRECTORY_LABEL = '(root)';

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)credentials(\.[a-z0-9]+)?$/i,
  /(^|\/)secrets?(\.[a-z0-9]+)?$/i,
  /(^|\/)service[-_]?account[^/]*\.json$/i,
];

/**
 * Flags paths that typically hold credentials so clients can treat them with
 * care. Only the path is reported; file contents are never part of a comparison.
 */
export function isSensitiveSnapshotPath(filePath: string) {
  return isEnvFilePath(filePath) || SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function corruptedArchiveError() {
  return new HttpError(422, 'SNAPSHOT_ARCHIVE_CORRUPTED', 'Snapshot archive is corrupted or unreadable');
}

/**
 * Streams every file entry of a ZIP archive through SHA-256 while enforcing
 * entry, file, path-length and decompressed-byte limits. Decompressed bytes are
 * counted as they are read, so misreported entry sizes cannot bypass the limit.
 */
export function buildSnapshotManifest(options: BuildSnapshotManifestOptions): Promise<SnapshotManifest> {
  return new Promise((resolve, reject) => {
    const files = new Map<string, SnapshotManifestFile>();
    let totalEntries = 0;
    let totalBytes = 0;
    let settled = false;

    yauzl.fromBuffer(
      options.archiveBuffer,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(corruptedArchiveError());
          return;
        }

        const fail = (error: unknown) => {
          if (settled) {
            return;
          }

          settled = true;
          zipFile.close();
          reject(error instanceof HttpError ? error : corruptedArchiveError());
        };

        zipFile.on('error', fail);

        zipFile.on('end', () => {
          if (settled) {
            return;
          }

          settled = true;
          resolve({ files, fileCount: files.size, totalBytes });
        });

        zipFile.on('entry', (entry: yauzl.Entry) => {
          if (settled) {
            return;
          }

          try {
            totalEntries += 1;
            if (totalEntries > options.maxEntries) {
              throw new HttpError(413, 'SNAPSHOT_TOO_MANY_ENTRIES', 'Snapshot archive entry count exceeds limit');
            }

            const rawPath = String(entry.fileName);
            if (rawPath.length > options.maxPathLength) {
              throw new HttpError(400, 'SNAPSHOT_ENTRY_PATH_TOO_LONG', 'Snapshot archive entry path exceeds limit');
            }

            if (rawPath.endsWith('/')) {
              zipFile.readEntry();
              return;
            }

            const relativePath = normalizeArchivePath(rawPath);
            if (files.has(relativePath)) {
              throw new HttpError(
                422,
                'SNAPSHOT_ARCHIVE_DUPLICATE_ENTRY',
                'Snapshot archive contains duplicate file entries',
              );
            }

            if (files.size + 1 > options.maxFiles) {
              throw new HttpError(413, 'SNAPSHOT_TOO_MANY_FILES', 'Snapshot file count exceeds limit');
            }

            if (totalBytes + entry.uncompressedSize > options.maxTotalBytes) {
              throw new HttpError(413, 'SNAPSHOT_ARCHIVE_TOO_LARGE', 'Snapshot uncompressed size exceeds limit');
            }

            zipFile.openReadStream(entry, (streamError, readStream) => {
              if (streamError || !readStream) {
                fail(streamError);
                return;
              }

              const hash = createHash('sha256');
              let entryBytes = 0;

              readStream.on('data', (chunk: Buffer) => {
                entryBytes += chunk.byteLength;
                totalBytes += chunk.byteLength;

                if (totalBytes > options.maxTotalBytes) {
                  readStream.destroy();
                  fail(new HttpError(413, 'SNAPSHOT_ARCHIVE_TOO_LARGE', 'Snapshot uncompressed size exceeds limit'));
                  return;
                }

                hash.update(chunk);
              });
              readStream.on('error', fail);
              readStream.on('end', () => {
                if (settled) {
                  return;
                }

                files.set(relativePath, { sizeBytes: entryBytes, sha256: hash.digest('hex') });
                zipFile.readEntry();
              });
            });
          } catch (error) {
            fail(error);
          }
        });

        zipFile.readEntry();
      },
    );
  });
}

function topLevelDirectory(filePath: string) {
  const separatorIndex = filePath.indexOf('/');
  return separatorIndex === -1 ? ROOT_DIRECTORY_LABEL : filePath.slice(0, separatorIndex);
}

function compareStrings(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Deterministically classifies files by path and SHA-256 content hash.
 * Counts are always exact; per-category lists are capped at `listLimit`.
 */
export function compareSnapshotManifests(
  base: SnapshotManifest,
  target: SnapshotManifest,
  options: { listLimit?: number } = {},
): SnapshotManifestComparison {
  const listLimit = Math.max(0, options.listLimit ?? DEFAULT_COMPARISON_LIST_LIMIT);
  const buckets: Record<SnapshotFileChangeStatus, SnapshotFileChange[]> = {
    ADDED: [],
    MODIFIED: [],
    DELETED: [],
    UNCHANGED: [],
  };
  const directories = new Map<string, SnapshotDirectoryChangeSummary>();

  const record = (change: SnapshotFileChange) => {
    buckets[change.status].push(change);

    const directory = topLevelDirectory(change.path);
    const summary = directories.get(directory) ?? { directory, added: 0, modified: 0, deleted: 0, unchanged: 0 };
    if (change.status === 'ADDED') summary.added += 1;
    if (change.status === 'MODIFIED') summary.modified += 1;
    if (change.status === 'DELETED') summary.deleted += 1;
    if (change.status === 'UNCHANGED') summary.unchanged += 1;
    directories.set(directory, summary);
  };

  for (const [filePath, baseFile] of base.files) {
    const targetFile = target.files.get(filePath);
    const sensitive = isSensitiveSnapshotPath(filePath);

    if (!targetFile) {
      record({
        path: filePath,
        status: 'DELETED',
        baseSizeBytes: baseFile.sizeBytes,
        targetSizeBytes: null,
        sizeDeltaBytes: -baseFile.sizeBytes,
        sensitive,
      });
      continue;
    }

    const identical = baseFile.sizeBytes === targetFile.sizeBytes && baseFile.sha256 === targetFile.sha256;
    record({
      path: filePath,
      status: identical ? 'UNCHANGED' : 'MODIFIED',
      baseSizeBytes: baseFile.sizeBytes,
      targetSizeBytes: targetFile.sizeBytes,
      sizeDeltaBytes: targetFile.sizeBytes - baseFile.sizeBytes,
      sensitive,
    });
  }

  for (const [filePath, targetFile] of target.files) {
    if (base.files.has(filePath)) {
      continue;
    }

    record({
      path: filePath,
      status: 'ADDED',
      baseSizeBytes: null,
      targetSizeBytes: targetFile.sizeBytes,
      sizeDeltaBytes: targetFile.sizeBytes,
      sensitive: isSensitiveSnapshotPath(filePath),
    });
  }

  const sortAndCap = (items: SnapshotFileChange[]) =>
    items.sort((left, right) => compareStrings(left.path, right.path)).slice(0, listLimit);

  const sensitiveChanged = [...buckets.ADDED, ...buckets.MODIFIED, ...buckets.DELETED].filter(
    (change) => change.sensitive,
  ).length;

  const summary: SnapshotComparisonSummary = {
    baseFileCount: base.files.size,
    targetFileCount: target.files.size,
    added: buckets.ADDED.length,
    modified: buckets.MODIFIED.length,
    deleted: buckets.DELETED.length,
    unchanged: buckets.UNCHANGED.length,
    changed: buckets.ADDED.length + buckets.MODIFIED.length + buckets.DELETED.length,
    baseTotalBytes: base.totalBytes,
    targetTotalBytes: target.totalBytes,
    netSizeDeltaBytes: target.totalBytes - base.totalBytes,
    sensitiveChanged,
  };

  const directorySummaries = [...directories.values()]
    .sort((left, right) => {
      const leftChanges = left.added + left.modified + left.deleted;
      const rightChanges = right.added + right.modified + right.deleted;
      return rightChanges - leftChanges || compareStrings(left.directory, right.directory);
    })
    .slice(0, MAX_DIRECTORY_SUMMARIES);

  return {
    summary,
    added: sortAndCap(buckets.ADDED),
    modified: sortAndCap(buckets.MODIFIED),
    deleted: sortAndCap(buckets.DELETED),
    unchanged: sortAndCap(buckets.UNCHANGED),
    truncated: {
      added: summary.added > listLimit,
      modified: summary.modified > listLimit,
      deleted: summary.deleted > listLimit,
      unchanged: summary.unchanged > listLimit,
    },
    directories: directorySummaries,
  };
}
