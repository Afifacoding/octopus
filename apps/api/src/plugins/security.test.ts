import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

describe('security CORS', () => {
  it('allows DELETE in preflight response', async () => {
    const app = buildApp();

    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/projects/project_1/snapshots/snapshot_1',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'DELETE',
          'access-control-request-headers': 'content-type',
        },
      });

      expect(response.statusCode).toBe(204);
      const allowMethods = response.headers['access-control-allow-methods'] ?? '';
      expect(String(allowMethods)).toContain('DELETE');
    } finally {
      await app.close();
    }
  });
});
