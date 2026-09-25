import { describe, expect, it } from 'vitest';
import yazl from 'yazl';

import { buildDirectoryTreeFromZip } from './snapshots.directory-tree.js';

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

function mutateZipFileNames(buffer: Buffer, from: string, to: string) {
  if (from.length !== to.length) {
    throw new Error('Mutation paths must have equal length');
  }

  const output = Buffer.from(buffer);
  const fromBuffer = Buffer.from(from);
  const toBuffer = Buffer.from(to);

  // Rewrite only ZIP local/central directory filename fields to keep the
  // archive structure valid while injecting path edge cases for parser tests.
  let offset = 0;
  while (offset + 4 <= output.length) {
    const signature = output.readUInt32LE(offset);

    if (signature === 0x04034b50) {
      const fileNameLength = output.readUInt16LE(offset + 26);
      const extraLength = output.readUInt16LE(offset + 28);
      const compressedSize = output.readUInt32LE(offset + 18);
      const fileNameStart = offset + 30;

      if (fileNameLength === fromBuffer.length && output.subarray(fileNameStart, fileNameStart + fileNameLength).equals(fromBuffer)) {
        toBuffer.copy(output, fileNameStart);
      }

      offset = fileNameStart + fileNameLength + extraLength + compressedSize;
      continue;
    }

    if (signature === 0x02014b50) {
      const fileNameLength = output.readUInt16LE(offset + 28);
      const extraLength = output.readUInt16LE(offset + 30);
      const commentLength = output.readUInt16LE(offset + 32);
      const fileNameStart = offset + 46;

      if (fileNameLength === fromBuffer.length && output.subarray(fileNameStart, fileNameStart + fileNameLength).equals(fromBuffer)) {
        toBuffer.copy(output, fileNameStart);
      }

      offset = fileNameStart + fileNameLength + extraLength + commentLength;
      continue;
    }

    offset += 1;
  }

  return output;
}

async function buildTree(archiveBuffer: Buffer, overrides?: Partial<{
  maxFiles: number;
  maxDirectories: number;
  maxEntries: number;
  maxPathLength: number;
  maxTotalBytes: number;
}>) {
  return buildDirectoryTreeFromZip({
    archiveBuffer,
    maxFiles: overrides?.maxFiles ?? 50,
    maxDirectories: overrides?.maxDirectories ?? 50,
    maxEntries: overrides?.maxEntries ?? 100,
    maxPathLength: overrides?.maxPathLength ?? 512,
    maxTotalBytes: overrides?.maxTotalBytes ?? 1024 * 1024,
  });
}

describe('buildDirectoryTreeFromZip', () => {
  it('generates nested tree for a valid archive', async () => {
    const zip = await createZipBuffer([
      { path: 'project/src/components' },
      { path: 'project/src/components/Header.tsx', content: 'export const Header = () => null;' },
      { path: 'project/src/App.tsx', content: 'export const App = () => null;' },
      { path: 'project/package.json', content: '{"name":"project"}' },
    ]);

    const tree = await buildTree(zip);

    expect(tree.totalFiles).toBe(3);
    expect(tree.totalDirectories).toBe(4);
    expect(tree.nodes[0]?.name).toBe('project');
    expect(tree.nodes[0]?.children[0]?.name).toBe('src');
    expect(tree.nodes[0]?.children[1]?.name).toBe('package.json');
  });

  it('supports empty ZIP archives', async () => {
    const zip = await createZipBuffer([]);
    const tree = await buildTree(zip);

    expect(tree.totalEntries).toBe(0);
    expect(tree.totalFiles).toBe(0);
    expect(tree.totalDirectories).toBe(0);
    expect(tree.nodes).toHaveLength(0);
  });

  it('rejects malformed ZIP archives', async () => {
    await expect(buildTree(Buffer.from('not-a-zip'))).rejects.toMatchObject({
      code: 'SNAPSHOT_ARCHIVE_INVALID',
    });
  });

  it('rejects path traversal entries in ZIP', async () => {
    const safeZip = await createZipBuffer([{ path: '__SAFETRAV__', content: 'x' }]);
    const zip = mutateZipFileNames(safeZip, '__SAFETRAV__', '../dangr.txt');

    await expect(buildTree(zip)).rejects.toMatchObject({
      code: 'SNAPSHOT_ARCHIVE_INVALID',
    });
  });

  it('rejects absolute path entries in ZIP', async () => {
    const safeZip = await createZipBuffer([{ path: '__SAFEABS__', content: 'x' }]);
    const zip = mutateZipFileNames(safeZip, '__SAFEABS__', '/etc/passwd');

    await expect(buildTree(zip)).rejects.toMatchObject({
      code: 'SNAPSHOT_ARCHIVE_INVALID',
    });
  });

  it('rejects null-byte path entries in ZIP', async () => {
    const safeZip = await createZipBuffer([{ path: 'safe.txt', content: 'ok' }]);
    const maliciousZip = mutateZipFileNames(safeZip, 'safe.txt', 'safe\u0000txt');

    await expect(buildTree(maliciousZip)).rejects.toMatchObject({
      code: 'SNAPSHOT_INVALID_ENTRY_PATH',
    });
  });

  it('enforces file limits during ZIP processing', async () => {
    const zip = await createZipBuffer([
      { path: 'one.txt', content: '1' },
      { path: 'two.txt', content: '2' },
    ]);

    await expect(buildTree(zip, { maxFiles: 1 })).rejects.toMatchObject({
      code: 'SNAPSHOT_TOO_MANY_FILES',
    });
  });

  it('enforces directory limits during ZIP processing', async () => {
    const zip = await createZipBuffer([
      { path: 'a/b/c/file.txt', content: 'x' },
    ]);

    await expect(buildTree(zip, { maxDirectories: 2 })).rejects.toMatchObject({
      code: 'SNAPSHOT_TOO_MANY_DIRECTORIES',
    });
  });

  it('enforces max total uncompressed bytes during ZIP processing', async () => {
    const zip = await createZipBuffer([{ path: 'big.txt', content: '1234567890' }]);

    await expect(buildTree(zip, { maxTotalBytes: 5 })).rejects.toMatchObject({
      code: 'SNAPSHOT_ARCHIVE_TOO_LARGE',
    });
  });
});
