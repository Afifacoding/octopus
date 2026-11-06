import { describe, expect, it } from 'vitest';

import { getHealthStatus } from './health.service.js';

describe('getHealthStatus', () => {
  it('reports the API and database as ready when the connectivity check succeeds', async () => {
    const result = await getHealthStatus(async () => {});

    expect(result.status).toBe('ok');
    expect(result.service).toBe('octopus-api');
    expect(result.database).toBe('connected');
  });

  it('reports the database as unavailable without leaking the underlying error', async () => {
    const result = await getHealthStatus(async () => {
      throw new Error('connection details must not be returned');
    });

    expect(result.status).toBe('unavailable');
    expect(result.database).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('connection details');
  });
});
