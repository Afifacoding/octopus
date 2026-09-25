import path from 'node:path';

import yauzl from 'yauzl';

import { HttpError } from '../../core/errors/http-error.js';
import { assertSafeRelativePath } from '../../core/security/secure-file-path.js';
import type { SnapshotDirectoryTree, SnapshotTreeNode } from './snapshots.types.js';

type ParsedArchiveEntry = {
  relativePath: string;
  type: 'DIRECTORY' | 'FILE';
  sizeBytes: number;
};

type ParseArchiveTreeOptions = {
  archiveBuffer: Buffer;
  maxFiles: number;
  maxDirectories: number;
  maxEntries: number;
  maxPathLength: number;
  maxTotalBytes: number;
};

type MutableNode = {
  name: string;
  relativePath: string;
  type: 'DIRECTORY' | 'FILE';
  sizeBytes: number | null;
  children: Map<string, MutableNode>;
};

function normalizeArchivePath(inputPath: string) {
  if (inputPath.includes('\u0000')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot archive entry contains invalid characters');
  }

  if (/^[a-zA-Z]:/.test(inputPath) || inputPath.startsWith('/') || inputPath.startsWith('\\')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Absolute archive entry paths are not allowed');
  }

  const normalized = assertSafeRelativePath(path.posix.normalize(inputPath.replace(/\\/g, '/')));
  if (normalized === '.' || normalized === '') {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot archive entry path is invalid');
  }

  return normalized;
}

function parentDirectories(relativePath: string) {
  const segments = relativePath.split('/').filter(Boolean);
  const parentPaths: string[] = [];

  for (let index = 1; index < segments.length; index += 1) {
    parentPaths.push(segments.slice(0, index).join('/'));
  }

  return parentPaths;
}

function registerDirectoryPath(directoryPath: string, knownDirectories: Set<string>, maxDirectories: number) {
  const normalized = directoryPath.replace(/\/+$/u, '');
  if (!normalized) {
    return;
  }

  if (!knownDirectories.has(normalized)) {
    knownDirectories.add(normalized);
  }

  if (knownDirectories.size > maxDirectories) {
    throw new HttpError(400, 'SNAPSHOT_TOO_MANY_DIRECTORIES', 'Snapshot directory count exceeds limit');
  }
}

function parseZipEntries(options: ParseArchiveTreeOptions): Promise<ParsedArchiveEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: ParsedArchiveEntry[] = [];
    const directoryPaths = new Set<string>();
    let fileCount = 0;
    let totalEntries = 0;
    let totalSizeBytes = 0;

    const fail = (error: unknown) => {
      reject(error instanceof HttpError ? error : new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Invalid ZIP archive'));
    };

    yauzl.fromBuffer(options.archiveBuffer, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        fail(openError);
        return;
      }

      zipFile.on('error', (zipError) => {
        zipFile.close();
        fail(zipError);
      });

      zipFile.on('entry', (entry) => {
        try {
          totalEntries += 1;
          if (totalEntries > options.maxEntries) {
            throw new HttpError(400, 'SNAPSHOT_TOO_MANY_ENTRIES', 'Snapshot entry count exceeds limit');
          }

          const normalizedPath = normalizeArchivePath(entry.fileName);
          if (normalizedPath.length > options.maxPathLength) {
            throw new HttpError(400, 'SNAPSHOT_ENTRY_PATH_TOO_LONG', 'Snapshot entry path is too long');
          }

          const isDirectory = entry.fileName.endsWith('/');

          if (isDirectory) {
            registerDirectoryPath(normalizedPath, directoryPaths, options.maxDirectories);

            entries.push({
              relativePath: normalizedPath,
              type: 'DIRECTORY',
              sizeBytes: 0,
            });

            zipFile.readEntry();
            return;
          }

          fileCount += 1;
          if (fileCount > options.maxFiles) {
            throw new HttpError(400, 'SNAPSHOT_TOO_MANY_FILES', 'Snapshot file count exceeds limit');
          }

          for (const parentDirectory of parentDirectories(normalizedPath)) {
            registerDirectoryPath(parentDirectory, directoryPaths, options.maxDirectories);
          }

          totalSizeBytes += entry.uncompressedSize;
          if (totalSizeBytes > options.maxTotalBytes) {
            throw new HttpError(413, 'SNAPSHOT_ARCHIVE_TOO_LARGE', 'Snapshot archive exceeds processing size limit');
          }

          entries.push({
            relativePath: normalizedPath,
            type: 'FILE',
            sizeBytes: entry.uncompressedSize,
          });

          zipFile.readEntry();
        } catch (error) {
          zipFile.close();
          fail(error);
        }
      });

      zipFile.on('end', () => {
        resolve(entries);
      });

      zipFile.readEntry();
    });
  });
}

function ensureDirectoryNode(
  roots: Map<string, MutableNode>,
  directoryPath: string,
): MutableNode {
  const segments = directoryPath.split('/').filter(Boolean);
  let currentMap = roots;
  let parentPath = '';
  let currentNode: MutableNode | null = null;

  for (const segment of segments) {
    const nextPath = parentPath ? `${parentPath}/${segment}` : segment;
    const existing = currentMap.get(segment);

    if (existing) {
      if (existing.type !== 'DIRECTORY') {
        throw new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Archive contains conflicting file and directory paths');
      }

      currentNode = existing;
      currentMap = existing.children;
      parentPath = nextPath;
      continue;
    }

    const created: MutableNode = {
      name: segment,
      relativePath: nextPath,
      type: 'DIRECTORY',
      sizeBytes: null,
      children: new Map<string, MutableNode>(),
    };

    currentMap.set(segment, created);
    currentNode = created;
    currentMap = created.children;
    parentPath = nextPath;
  }

  if (!currentNode) {
    throw new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Archive directory path is invalid');
  }

  return currentNode;
}

function addFileNode(roots: Map<string, MutableNode>, filePath: string, sizeBytes: number) {
  const segments = filePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Archive file path is invalid');
  }

  const fileName = segments[segments.length - 1] ?? '';
  const directoryPath = segments.slice(0, -1).join('/');

  const parentMap = directoryPath ? ensureDirectoryNode(roots, directoryPath).children : roots;
  const existing = parentMap.get(fileName);

  if (existing && existing.type === 'DIRECTORY') {
    throw new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Archive contains conflicting file and directory paths');
  }

  parentMap.set(fileName, {
    name: fileName,
    relativePath: filePath,
    type: 'FILE',
    sizeBytes,
    children: new Map<string, MutableNode>(),
  });
}

function toSerializableNode(node: MutableNode): SnapshotTreeNode {
  const sortedChildren = [...node.children.values()]
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'DIRECTORY' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    })
    .map((child) => toSerializableNode(child));

  return {
    name: node.name,
    relativePath: node.relativePath,
    type: node.type,
    sizeBytes: node.sizeBytes,
    children: sortedChildren,
  };
}

export async function buildDirectoryTreeFromZip(options: ParseArchiveTreeOptions): Promise<SnapshotDirectoryTree> {
  const parsedEntries = await parseZipEntries(options);
  const rootNodes = new Map<string, MutableNode>();

  const uniqueDirectories = new Set<string>();
  let fileCount = 0;
  let totalSizeBytes = 0;

  for (const entry of parsedEntries) {
    if (entry.type === 'DIRECTORY') {
      uniqueDirectories.add(entry.relativePath);
      ensureDirectoryNode(rootNodes, entry.relativePath);
      continue;
    }

    for (const parentDirectory of parentDirectories(entry.relativePath)) {
      uniqueDirectories.add(parentDirectory);
    }

    fileCount += 1;
    totalSizeBytes += entry.sizeBytes;
    addFileNode(rootNodes, entry.relativePath, entry.sizeBytes);
  }

  const nodes = [...rootNodes.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((node) => toSerializableNode(node));

  return {
    generatedAt: new Date().toISOString(),
    totalEntries: parsedEntries.length,
    totalFiles: fileCount,
    totalDirectories: uniqueDirectories.size,
    totalSizeBytes,
    nodes,
  };
}
