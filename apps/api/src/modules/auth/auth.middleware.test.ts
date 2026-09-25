import { describe, expect, it } from 'vitest';

import { createRequireAuth } from './auth.middleware.js';

type RequestStub = {
  cookies: Record<string, string>;
  auth?: {
    userId: string;
    sessionId: string;
  };
};

describe('Auth middleware', () => {
  it('rejects missing session cookie', async () => {
    const middleware = createRequireAuth({
      getCurrentUserBySessionToken: async () => ({
        sessionId: 'session_1',
        user: {
          id: 'user_1',
          username: 'alice',
          email: 'alice@gmail.com',
          emailVerified: true,
        },
      }),
    } as never);

    await expect(
      middleware(
        {
          cookies: {},
        } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('resolves session from backend-authenticated context', async () => {
    const middleware = createRequireAuth({
      getCurrentUserBySessionToken: async () => ({
        sessionId: 'session_1',
        user: {
          id: 'user_1',
          username: 'alice',
          email: 'alice@gmail.com',
          emailVerified: true,
        },
      }),
    } as never);

    const request: RequestStub = {
      cookies: {
        octopus_session: 'session-token',
      },
    };

    await (middleware as unknown as (req: RequestStub, reply: unknown) => Promise<void>)(request, {});

    expect(request.auth?.userId).toBe('user_1');
    expect(request.auth?.sessionId).toBe('session_1');
  });
});
