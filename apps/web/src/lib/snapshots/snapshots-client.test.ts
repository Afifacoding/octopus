import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildFallbackSnapshotFileName,
  downloadSnapshotArchive,
  downloadSnapshotAsZip,
  triggerBrowserDownload,
} from './snapshots-client';

const originalFetch = globalThis.fetch;

function createZipResponse(options: { disposition?: string | null; status?: number; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.disposition) {
    headers.set('content-disposition', options.disposition);
  }

  return {
    ok: (options.status ?? 200) < 400,
    status: options.status ?? 200,
    headers,
    blob: async () => new Blob([new Uint8Array([80, 75, 3, 4])], { type: 'application/zip' }),
    json: async () => options.body ?? {},
  } as unknown as Response;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubDownloadDom() {
  const anchor = {
    href: '',
    download: '',
    rel: '',
    click: vi.fn(),
  };

  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();

  vi.stubGlobal('document', {
    createElement: vi.fn(() => anchor),
    body: { appendChild, removeChild },
  });

  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

  return { anchor, appendChild, removeChild, createObjectURL, revokeObjectURL };
}

describe('buildFallbackSnapshotFileName', () => {
  it('builds a filename from project name and snapshot id', () => {
    expect(buildFallbackSnapshotFileName('Octopus Web', 'snap_1')).toBe('Octopus-Web_snapshot_snap_1.zip');
  });

  it('falls back to a generic project name', () => {
    expect(buildFallbackSnapshotFileName(undefined, 'snap_1')).toBe('project_snapshot_snap_1.zip');
  });

  it('removes unsafe path characters', () => {
    const fileName = buildFallbackSnapshotFileName('../../etc/passwd', 'snap_1');

    expect(fileName).not.toContain('/');
    expect(fileName).not.toContain('..');
  });
});

describe('downloadSnapshotArchive', () => {
  it('requests the snapshot download endpoint with credentials', async () => {
    const fetchMock = vi.fn(async () => createZipResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await downloadSnapshotArchive('project_1', 'snapshot_1', 'Octopus');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toContain('/projects/project_1/snapshots/snapshot_1/download');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('uses the server provided filename from content-disposition', async () => {
    globalThis.fetch = vi.fn(async () =>
      createZipResponse({ disposition: 'attachment; filename="octopus_snapshot_snap_1.zip"' }),
    ) as unknown as typeof fetch;

    const result = await downloadSnapshotArchive('project_1', 'snapshot_1');

    expect(result.fileName).toBe('octopus_snapshot_snap_1.zip');
  });

  it('falls back to a generated filename when no header is present', async () => {
    globalThis.fetch = vi.fn(async () => createZipResponse()) as unknown as typeof fetch;

    const result = await downloadSnapshotArchive('project_1', 'snapshot_1', 'Octopus');

    expect(result.fileName).toBe('Octopus_snapshot_snapshot_1.zip');
  });

  it('surfaces API error messages when the download fails', async () => {
    globalThis.fetch = vi.fn(async () =>
      createZipResponse({
        status: 404,
        body: { success: false, error: { code: 'SNAPSHOT_NOT_FOUND', message: 'Snapshot not found' } },
      }),
    ) as unknown as typeof fetch;

    await expect(downloadSnapshotArchive('project_1', 'snapshot_1')).rejects.toThrowError('Snapshot not found');
  });

  it('throws a status based message when the error body is not JSON', async () => {
    const headers = new Headers();
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      headers,
      blob: async () => new Blob(),
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;

    await expect(downloadSnapshotArchive('project_1', 'snapshot_1')).rejects.toThrowError('Download failed (500)');
  });
});

describe('triggerBrowserDownload', () => {
  it('creates and revokes an object url and clicks a download link', () => {
    const dom = stubDownloadDom();

    triggerBrowserDownload(new Blob(['zip']), 'octopus_snapshot_snap_1.zip');

    expect(dom.createObjectURL).toHaveBeenCalledTimes(1);
    expect(dom.anchor.click).toHaveBeenCalledTimes(1);
    expect(dom.anchor.href).toBe('blob:mock-url');
    expect(dom.anchor.download).toBe('octopus_snapshot_snap_1.zip');
    expect(dom.appendChild).toHaveBeenCalledTimes(1);
    expect(dom.removeChild).toHaveBeenCalledTimes(1);
    expect(dom.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    vi.unstubAllGlobals();
  });
});

describe('downloadSnapshotAsZip', () => {
  it('downloads and triggers the browser save flow', async () => {
    globalThis.fetch = vi.fn(async () =>
      createZipResponse({ disposition: 'attachment; filename="octopus_snapshot_snap_1.zip"' }),
    ) as unknown as typeof fetch;

    const dom = stubDownloadDom();

    const result = await downloadSnapshotAsZip('project_1', 'snapshot_1', 'Octopus');

    expect(result.fileName).toBe('octopus_snapshot_snap_1.zip');
    expect(dom.anchor.click).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('propagates errors so the UI can show a failure state', async () => {
    globalThis.fetch = vi.fn(async () =>
      createZipResponse({
        status: 403,
        body: { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
      }),
    ) as unknown as typeof fetch;

    await expect(downloadSnapshotAsZip('project_1', 'snapshot_1')).rejects.toThrowError('Not allowed');
  });
});
