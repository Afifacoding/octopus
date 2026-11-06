import { describe, expect, it } from 'vitest';

import { createHealthController } from './health.controller.js';

describe('health controller', () => {
  it('returns a successful readiness response when the database is reachable', async () => {
    const controller = createHealthController(async () => {});
    const response = {
      statusCode: 0,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return this;
      },
    };

    await controller({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      success: true,
      data: { database: 'connected' },
    });
  });

  it('returns 503 when database connectivity fails', async () => {
    const controller = createHealthController(async () => {
      throw new Error('database unavailable');
    });
    const response = {
      statusCode: 0,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return this;
      },
    };

    await controller({}, response);

    expect(response.statusCode).toBe(503);
    expect(response.payload).toMatchObject({
      success: false,
      data: { database: 'unavailable' },
    });
    expect(JSON.stringify(response.payload)).not.toContain('database unavailable');
  });
});
