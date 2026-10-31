import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createSnapshot } from './snapshots';

describe('streamed snapshot upload', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('streams a valid base64 JSON archive with exact content length and progress', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'octopus-upload-test-'));
    temporaryDirectories.push(directory);
    const archivePath = path.join(directory, 'workspace.zip');
    const archiveBytes = Buffer.from([0, 1, 2, 3, 4, 5, 6]);
    await writeFile(archivePath, archiveBytes);

    let capturedUrl = '';
    let capturedBody = Buffer.alloc(0);
    let capturedHeaders: Headers | undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      const chunks: Buffer[] = [];
      for await (const chunk of init?.body as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      capturedBody = Buffer.concat(chunks);
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ success: true, data: { snapshot: { id: 'snapshot_1' } } }),
      } as Response;
    }));

    const progress: Array<{ sent: number; total: number }> = [];
    const result = await createSnapshot({
      projectId: 'project_1',
      cookie: 'octopus_session=test-session',
      timeoutMs: 1000,
      archivePath,
      payload: {
        captureSource: 'EXTENSION',
        clientName: 'octopus-vscode-extension',
        clientVersion: '0.1.1',
        fileCount: 1,
        directoryCount: 0,
        archive: {
          fileName: 'workspace.zip',
          contentType: 'application/zip',
          sizeBytes: archiveBytes.byteLength,
        },
      },
      onUploadProgress: (sent, total) => progress.push({ sent, total }),
    });

    expect(result.snapshot.id).toBe('snapshot_1');
    expect(capturedUrl).toContain('/projects/project_1/snapshots');
    expect(capturedHeaders?.get('content-length')).toBe(String(capturedBody.byteLength));
    expect(capturedHeaders?.get('cookie')).toBe('octopus_session=test-session');
    expect(capturedBody.toString('utf8')).toContain('"base64Data":"AAECAwQFBg=="');
    expect(JSON.parse(capturedBody.toString('utf8'))).toEqual({
      captureSource: 'EXTENSION',
      clientName: 'octopus-vscode-extension',
      clientVersion: '0.1.1',
      fileCount: 1,
      directoryCount: 0,
      archive: {
        fileName: 'workspace.zip',
        contentType: 'application/zip',
        sizeBytes: archiveBytes.byteLength,
        base64Data: archiveBytes.toString('base64'),
      },
    });
    expect(progress.at(-1)).toEqual({
      sent: capturedBody.byteLength,
      total: capturedBody.byteLength,
    });
  });

  it('rejects if the archive changes after its size was measured', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'octopus-upload-mismatch-'));
    temporaryDirectories.push(directory);
    const archivePath = path.join(directory, 'workspace.zip');
    await writeFile(archivePath, Buffer.from('archive'));

    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      for await (const _chunk of init?.body as unknown as AsyncIterable<Uint8Array>) {
        // Consume the body to trigger the archive-size consistency check.
      }
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ success: true, data: { snapshot: { id: 'snapshot_1' } } }),
      } as Response;
    }));

    await expect(createSnapshot({
      projectId: 'project_1',
      cookie: 'octopus_session=test-session',
      timeoutMs: 1000,
      archivePath,
      payload: {
        captureSource: 'EXTENSION',
        archive: {
          fileName: 'workspace.zip',
          contentType: 'application/zip',
          sizeBytes: 6,
        },
      },
    })).rejects.toThrow('Snapshot archive changed while it was being uploaded');
  });

  it('streams the configured 30 MiB archive limit without collecting the whole request body', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'octopus-upload-max-'));
    temporaryDirectories.push(directory);
    const archivePath = path.join(directory, 'workspace.zip');
    const archiveSize = 30 * 1024 * 1024;
    await writeFile(archivePath, Buffer.alloc(archiveSize, 0x41));

    let receivedBytes = 0;
    let declaredLength = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      declaredLength = Number(new Headers(init?.headers).get('content-length'));
      for await (const chunk of init?.body as unknown as AsyncIterable<Uint8Array>) {
        receivedBytes += chunk.byteLength;
      }

      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ success: true, data: { snapshot: { id: 'snapshot_max' } } }),
      } as Response;
    }));

    let lastProgress = 0;
    const result = await createSnapshot({
      projectId: 'project_1',
      cookie: 'octopus_session=test-session',
      timeoutMs: 120_000,
      archivePath,
      payload: {
        captureSource: 'EXTENSION',
        archive: {
          fileName: 'workspace.zip',
          contentType: 'application/zip',
          sizeBytes: archiveSize,
        },
      },
      onUploadProgress(sentBytes) {
        lastProgress = sentBytes;
      },
    });

    expect(result.snapshot.id).toBe('snapshot_max');
    expect(receivedBytes).toBe(declaredLength);
    expect(lastProgress).toBe(declaredLength);
    expect(declaredLength).toBeGreaterThan(archiveSize);
    expect(declaredLength).toBeLessThan(50 * 1024 * 1024);
  });
});
