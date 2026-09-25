import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';

describe('error handler runtime safety', () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps.length = 0;
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      headers: {
        'content-type': 'application/json',
      },
      payload: '{',
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
  });
});
