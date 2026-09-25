import { afterEach, describe, expect, it, vi } from 'vitest';

import { octopusRequest } from './client';
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
});
