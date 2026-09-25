import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import yazl from 'yazl';

import { buildDirectoryTreeFromZip } from './snapshots.directory-tree.js';
import {
  buildSanitizedSnapshotZip,
  buildSnapshotDownloadFileName,
  maskEnvAssignments,
  sanitizeFileContentForDownload,
} from './snapshots.download.js';

async function createZipBuffer(entries: Array<{ path: string; content?: string }>) {
  const zipFile = new yazl.ZipFile();

  for (const entry of entries) {
    if (entry.content !== undefined) {
      zipFile.addBuffer(Buffer.from(entry.content), entry.path);
      continue;
    }

    zipFile.addEmptyDirectory(entry.path);
  }

  zipFile.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zipFile.outputStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function readZipEntryText(archiveBuffer: Buffer, targetPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(archiveBuffer, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('Unable to open archive'));
        return;
      }

      let found = false;

      zipFile.on('entry', (entry) => {
        if (String(entry.fileName) !== targetPath) {
          zipFile.readEntry();
          return;
        }

        found = true;
        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            reject(streamError ?? new Error('Unable to read entry'));
            return;
          }

          const chunks: Buffer[] = [];
          readStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          readStream.on('error', reject);
          readStream.on('end', () => {
            zipFile.close();
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        });
      });

      zipFile.on('end', () => {
        if (!found) {
          resolve(null);
        }
      });

      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

function flattenTreePaths(nodes: Array<{ relativePath: string; children: unknown[] }>): string[] {
  return nodes.flatMap((node) => [
    node.relativePath,
    ...flattenTreePaths(node.children as Array<{ relativePath: string; children: unknown[] }>),
  ]);
}

describe('buildSnapshotDownloadFileName', () => {
  it('builds a safe filename from project name and snapshot id', () => {
    expect(buildSnapshotDownloadFileName('Octopus Web', 'snap_123')).toBe('Octopus-Web_snapshot_snap_123.zip');
  });

  it('falls back when project name is missing', () => {
    expect(buildSnapshotDownloadFileName(null, 'snap_123')).toBe('project_snapshot_snap_123.zip');
  });

  it('strips path traversal and separators from the filename', () => {
    const fileName = buildSnapshotDownloadFileName('../../etc/passwd', 'snap/../1');

    expect(fileName).not.toContain('/');
    expect(fileName).not.toContain('..');
    expect(fileName.endsWith('.zip')).toBe(true);
  });
});

describe('maskEnvAssignments', () => {
  it('masks sensitive env values but keeps keys and structure', () => {
    const result = maskEnvAssignments(
      ['APP_NAME=octopus', 'OPENAI_API_KEY=sk-live-abcdef1234567890abcdef1234567890'].join('\n'),
    );

    expect(result.redactionApplied).toBe(true);
    expect(result.content).toContain('OPENAI_API_KEY=');
    expect(result.content).not.toContain('sk-live-abcdef1234567890abcdef1234567890');
    expect(result.content).toContain('APP_NAME=octopus');
  });

  it('leaves empty assignments untouched', () => {
    const result = maskEnvAssignments('EMPTY_KEY=');

    expect(result.content).toBe('EMPTY_KEY=');
    expect(result.redactionApplied).toBe(false);
  });
});

describe('sanitizeFileContentForDownload', () => {
  it('replaces detected raw values inside non-env source files', () => {
    const rawValue = 'sk-live-abcdef1234567890abcdef1234567890';

    const result = sanitizeFileContentForDownload({
      filePath: 'src/config.ts',
      content: `export const key = '${rawValue}';`,
      detectedValuesByPath: new Map([['src/config.ts', [rawValue]]]),
      globalDetectedValues: [rawValue],
    });

    expect(result.redactionApplied).toBe(true);
    expect(result.content).not.toContain(rawValue);
    expect(result.content).toContain('export const key =');
  });

  it('does not modify files without secret material', () => {
    const result = sanitizeFileContentForDownload({
      filePath: 'src/index.ts',
      content: 'export const value = 1;',
      detectedValuesByPath: new Map(),
      globalDetectedValues: [],
    });

    expect(result.redactionApplied).toBe(false);
    expect(result.content).toBe('export const value = 1;');
  });
});

describe('buildSanitizedSnapshotZip', () => {
  it('preserves the complete directory structure', async () => {
    const archiveBuffer = await createZipBuffer([
      { path: 'project/src' },
      { path: 'project/src/index.ts', content: 'export const value = 1;' },
      { path: 'project/src/lib' },
      { path: 'project/src/lib/util.ts', content: 'export const util = () => 1;' },
      { path: 'project/package.json', content: '{"name":"project"}' },
      { path: 'project/README.md', content: '# Project' },
    ]);

    const result = await buildSanitizedSnapshotZip({ archiveBuffer, maxPathLength: 400 });

    const tree = await buildDirectoryTreeFromZip({
      archiveBuffer: result.buffer,
      maxFiles: 1000,
      maxDirectories: 1000,
      maxEntries: 2000,
      maxPathLength: 400,
      maxTotalBytes: 10 * 1024 * 1024,
    });

    const paths = flattenTreePaths(tree.nodes as never);

    expect(paths).toContain('project/src/index.ts');
    expect(paths).toContain('project/src/lib/util.ts');
    expect(paths).toContain('project/package.json');
    expect(paths).toContain('project/README.md');
  });

  it('preserves non-sensitive file contents byte for byte', async () => {
    const archiveBuffer = await createZipBuffer([
      { path: 'project/src/index.ts', content: 'export const value = 1;' },
    ]);

    const result = await buildSanitizedSnapshotZip({ archiveBuffer, maxPathLength: 400 });
    const content = await readZipEntryText(result.buffer, 'project/src/index.ts');

    expect(content).toBe('export const value = 1;');
    expect(result.sanitizedFileCount).toBe(0);
    expect(result.totalFileCount).toBe(1);
  });

  it('masks secrets found in .env files', async () => {
    const archiveBuffer = await createZipBuffer([
      {
        path: 'project/.env',
        content: [
          'APP_NAME=octopus',
          'OPENAI_API_KEY=sk-live-abcdef1234567890abcdef1234567890',
          'JWT_SECRET=jwt-super-secret-value-9876543210',
          'DATABASE_URL=postgresql://admin:SuperSecretPassword123@db.internal:5432/octopus',
        ].join('\n'),
      },
    ]);

    const result = await buildSanitizedSnapshotZip({ archiveBuffer, maxPathLength: 400 });
    const envContent = (await readZipEntryText(result.buffer, 'project/.env')) ?? '';

    expect(envContent).not.toContain('sk-live-abcdef1234567890abcdef1234567890');
    expect(envContent).not.toContain('jwt-super-secret-value-9876543210');
    expect(envContent).not.toContain('SuperSecretPassword123');
    expect(envContent).toContain('OPENAI_API_KEY=');
    expect(envContent).toContain('JWT_SECRET=');
    expect(envContent).toContain('DATABASE_URL=');
    expect(envContent).toContain('APP_NAME=octopus');
    expect(result.sanitizedFileCount).toBe(1);
  });

  it('keeps the .env file present so the project stays usable', async () => {
    const archiveBuffer = await createZipBuffer([
      { path: 'project/.env', content: 'JWT_SECRET=jwt-super-secret-value-9876543210' },
      { path: 'project/.env.example', content: 'JWT_SECRET=replace-me' },
    ]);

    const result = await buildSanitizedSnapshotZip({ archiveBuffer, maxPathLength: 400 });

    const tree = await buildDirectoryTreeFromZip({
      archiveBuffer: result.buffer,
      maxFiles: 1000,
      maxDirectories: 1000,
      maxEntries: 2000,
      maxPathLength: 400,
      maxTotalBytes: 10 * 1024 * 1024,
    });

    const paths = flattenTreePaths(tree.nodes as never);

    expect(paths).toContain('project/.env');
    expect(paths).toContain('project/.env.example');
  });

  it('rejects invalid archive buffers', async () => {
    await expect(
      buildSanitizedSnapshotZip({ archiveBuffer: Buffer.from('not-a-zip'), maxPathLength: 400 }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_ARCHIVE_INVALID' });
  });
});
