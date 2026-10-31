import { afterEach, describe, expect, it, vi } from 'vitest';

import { octopusRequest, octopusRequestWithStream } from './client';
import { OctopusApiError } from './types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('octopus api client', () => {
  it('handles successful responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ success: true, data: { ok: true } }),
    }) as typeof fetch;

    const result = await octopusRequest<{ ok: boolean }>('/health');
    expect(result.ok).toBe(true);
  });

  it('surfaces unauthorized responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => JSON.stringify({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } }),
    }) as typeof fetch;

    await expect(octopusRequest('/auth/me')).rejects.toBeInstanceOf(OctopusApiError);
  });

  it('surfaces server errors safely', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => JSON.stringify({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected server error' } }),
    }) as typeof fetch;

    await expect(octopusRequest('/projects')).rejects.toBeInstanceOf(OctopusApiError);
  });

  it('streams request bytes with content length and reports upload progress', async () => {
    let requestBody = '';
    let requestHeaders: Headers | undefined;
    global.fetch = vi.fn(async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      const stream = init?.body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        requestBody += new TextDecoder().decode(chunk);
      }

      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ success: true, data: { snapshotId: 'snapshot_1' } }),
      } as Response;
    }) as typeof fetch;

    const progress: Array<{ sent: number; total: number }> = [];
    const chunks = [new TextEncoder().encode('{"archive":"'), new TextEncoder().encode('YQ=="}')];
    const contentLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);

    const result = await octopusRequestWithStream<{ snapshotId: string }>('/projects/project_1/snapshots', {
      body: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      contentLength,
      cookie: 'octopus_session=test-session',
      onUploadProgress: (sent, total) => progress.push({ sent, total }),
    });

    expect(result).toEqual({ snapshotId: 'snapshot_1' });
    expect(requestBody).toBe('{"archive":"YQ=="}');
    expect(requestHeaders?.get('content-length')).toBe(String(contentLength));
    expect(requestHeaders?.get('cookie')).toBe('octopus_session=test-session');
    expect(progress.at(-1)).toEqual({ sent: contentLength, total: contentLength });
  });
});
