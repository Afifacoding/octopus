import { describe, expect, it } from 'vitest';

import { getHealthStatus } from './health.service.js';

describe('getHealthStatus', () => {
  it('returns ok status payload', () => {
    const result = getHealthStatus();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('octopus-api');
  });
});
