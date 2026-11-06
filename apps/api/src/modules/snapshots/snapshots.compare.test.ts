import { describe, expect, it } from 'vitest';
import yazl from 'yazl';

import { HttpError } from '../../core/errors/http-error.js';
import {
  buildSnapshotManifest,
  compareSnapshotManifests,
  isSensitiveSnapshotPath,
  type SnapshotManifest,
} from './snapshots.compare.js';

async function createZip(entries: Array<{ path: string; content?: string }>) {
  const zipFile = new yazl.ZipFile();
  for (const entry of entries) {
    if (entry.content === undefined) {
      zipFile.addEmptyDirectory(entry.path);
    } else {
      zipFile.addBuffer(Buffer.from(entry.content), entry.path);
    }
  }
  zipFile.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zipFile.outputStream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const limits = {
  maxEntries: 1000,
  maxFiles: 1000,
  maxPathLength: 512,
  maxTotalBytes: 10 * 1024 * 1024,
};

async function manifestOf(entries: Array<{ path: string; content?: string }>, overrides: Partial<typeof limits> = {}) {
  return buildSnapshotManifest({ archiveBuffer: await createZip(entries), ...limits, ...overrides });
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected promise to reject');
}

describe('buildSnapshotManifest', () => {
  it('hashes every file, ignores directories and counts decompressed bytes', async () => {
    const manifest = await manifestOf([
      { path: 'src/' },
      { path: 'src/index.ts', content: 'export const a = 1;' },
      { path: 'README.md', content: '# Demo' },
    ]);

    expect(manifest.fileCount).toBe(2);
    expect(manifest.totalBytes).toBe('export const a = 1;'.length + '# Demo'.length);
    expect(manifest.files.get('src/index.ts')?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.files.has('src')).toBe(false);
  });

  it('rejects corrupted archives with a safe error', async () => {
    const error = await captureError(
      buildSnapshotManifest({ archiveBuffer: Buffer.from('definitely not a zip archive'), ...limits }),
    );

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).code).toBe('SNAPSHOT_ARCHIVE_CORRUPTED');
    expect((error as HttpError).statusCode).toBe(422);
  });

  it('rejects truncated archives', async () => {
    const archive = await createZip([{ path: 'a.txt', content: 'x'.repeat(4096) }]);
    const error = await captureError(
      buildSnapshotManifest({ archiveBuffer: archive.subarray(0, Math.floor(archive.length / 2)), ...limits }),
    );

    expect((error as HttpError).code).toBe('SNAPSHOT_ARCHIVE_CORRUPTED');
  });

  it('rejects duplicate file entries instead of silently overwriting them', async () => {
    const error = await captureError(manifestOf([
      { path: 'src/a.ts', content: 'one' },
      { path: 'src/a.ts', content: 'two' },
    ]));

    expect((error as HttpError).code).toBe('SNAPSHOT_ARCHIVE_DUPLICATE_ENTRY');
  });

  it('rejects path traversal entries', async () => {
    // yazl refuses to write traversal names, so patch a same-length name in place.
    const archive = await createZip([{ path: 'xx/escape.txt', content: 'x' }]);
    const tampered = Buffer.from(archive.toString('latin1').split('xx/escape.txt').join('../escape.txt'), 'latin1');

    const error = await captureError(buildSnapshotManifest({ archiveBuffer: tampered, ...limits }));

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBeLessThan(500);
  });

  it('enforces file count, entry count, path length and decompressed size limits', async () => {
    const files = [
      { path: 'a.txt', content: 'aaaa' },
      { path: 'b.txt', content: 'bbbb' },
    ];

    expect(((await captureError(manifestOf(files, { maxFiles: 1 }))) as HttpError).code).toBe('SNAPSHOT_TOO_MANY_FILES');
    expect(((await captureError(manifestOf(files, { maxEntries: 1 }))) as HttpError).code).toBe('SNAPSHOT_TOO_MANY_ENTRIES');
    expect(((await captureError(manifestOf(files, { maxPathLength: 3 }))) as HttpError).code).toBe('SNAPSHOT_ENTRY_PATH_TOO_LONG');
    expect(((await captureError(manifestOf(files, { maxTotalBytes: 6 }))) as HttpError).code).toBe('SNAPSHOT_ARCHIVE_TOO_LARGE');
  });
});

describe('compareSnapshotManifests', () => {
  it('classifies added, modified, deleted and unchanged files by content', async () => {
    const base = await manifestOf([
      { path: 'src/keep.ts', content: 'same' },
      { path: 'src/edit.ts', content: 'before' },
      { path: 'src/old.ts', content: 'gone' },
      { path: 'README.md', content: 'docs' },
    ]);
    const target = await manifestOf([
      { path: 'src/keep.ts', content: 'same' },
      { path: 'src/edit.ts', content: 'after!' },
      { path: 'src/new.ts', content: 'fresh' },
      { path: 'README.md', content: 'docs' },
    ]);

    const result = compareSnapshotManifests(base, target);

    expect(result.added.map((file) => file.path)).toEqual(['src/new.ts']);
    expect(result.modified.map((file) => file.path)).toEqual(['src/edit.ts']);
    expect(result.deleted.map((file) => file.path)).toEqual(['src/old.ts']);
    expect(result.unchanged.map((file) => file.path)).toEqual(['README.md', 'src/keep.ts']);
    expect(result.summary).toMatchObject({
      baseFileCount: 4,
      targetFileCount: 4,
      added: 1,
      modified: 1,
      deleted: 1,
      unchanged: 2,
      changed: 3,
    });
    expect(result.directories[0]).toEqual({ directory: 'src', added: 1, modified: 1, deleted: 1, unchanged: 1 });
  });

  it('detects modifications that keep the same file size', async () => {
    const base = await manifestOf([{ path: 'config.json', content: '{"a":1}' }]);
    const target = await manifestOf([{ path: 'config.json', content: '{"a":2}' }]);

    const result = compareSnapshotManifests(base, target);

    expect(result.summary.modified).toBe(1);
    expect(result.modified[0]?.sizeDeltaBytes).toBe(0);
  });

  it('reports identical snapshots as fully unchanged', async () => {
    const entries = [{ path: 'a.ts', content: 'a' }, { path: 'b/c.ts', content: 'c' }];
    const result = compareSnapshotManifests(await manifestOf(entries), await manifestOf(entries));

    expect(result.summary).toMatchObject({ added: 0, modified: 0, deleted: 0, unchanged: 2, changed: 0 });
  });

  it('never exposes file contents or hashes and flags sensitive paths', async () => {
    const base = await manifestOf([{ path: '.env', content: 'API_KEY=super-secret-value' }]);
    const target = await manifestOf([{ path: '.env', content: 'API_KEY=rotated-secret-value' }]);

    const result = compareSnapshotManifests(base, target);
    const serialized = JSON.stringify(result);
    const hash = base.files.get('.env')?.sha256 as string;

    expect(result.modified[0]).toMatchObject({ path: '.env', sensitive: true });
    expect(result.summary.sensitiveChanged).toBe(1);
    expect(serialized).not.toContain('super-secret-value');
    expect(serialized).not.toContain('rotated-secret-value');
    expect(serialized).not.toContain(hash);
    expect(serialized).not.toContain('sha256');
  });

  it('caps listed files while keeping exact counts', () => {
    const files = new Map(
      Array.from({ length: 10 }, (_, index) => [`file-${index}.ts`, { sizeBytes: 1, sha256: `h${index}` }] as const),
    );
    const empty: SnapshotManifest = { files: new Map(), fileCount: 0, totalBytes: 0 };
    const target: SnapshotManifest = { files: new Map(files), fileCount: 10, totalBytes: 10 };

    const result = compareSnapshotManifests(empty, target, { listLimit: 3 });

    expect(result.summary.added).toBe(10);
    expect(result.added).toHaveLength(3);
    expect(result.truncated.added).toBe(true);
    expect(result.added.map((file) => file.path)).toEqual(['file-0.ts', 'file-1.ts', 'file-2.ts']);
  });
});

describe('isSensitiveSnapshotPath', () => {
  it('flags env files and common credential files only', () => {
    expect(isSensitiveSnapshotPath('apps/api/.env.production')).toBe(true);
    expect(isSensitiveSnapshotPath('keys/id_rsa')).toBe(true);
    expect(isSensitiveSnapshotPath('certs/server.pem')).toBe(true);
    expect(isSensitiveSnapshotPath('src/index.ts')).toBe(false);
    expect(isSensitiveSnapshotPath('docs/secrets-guide.md')).toBe(false);
  });
});
