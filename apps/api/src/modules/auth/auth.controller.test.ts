import { describe, expect, it } from 'vitest';

import { createAuthController } from './auth.controller.js';

describe('Auth controller authorization foundation', () => {
  it('uses backend auth context userId for profile updates', async () => {
    const calls: Array<{ userId: string; input: unknown }> = [];

    const controller = createAuthController({
      updateProfile: async (userId: string, input: unknown) => {
        calls.push({ userId, input });
        return {
          id: userId,
          username: 'safe_user',
          email: 'safe_user@gmail.com',
          emailVerified: true,
          createdAt: new Date().toISOString(),
        };
      },
    } as never);

    const request = {
      auth: {
        userId: 'user_from_session',
      },
      body: {
        userId: 'malicious_other_user',
        username: 'safe_user',
      },
    };

    const payloads: unknown[] = [];
    const reply = {
      status: (_code: number) => ({
        send: (payload: unknown) => {
          payloads.push(payload);
          return payload;
        },
      }),
    };

    await controller.updateProfile(request as never, reply as never);

    expect(calls[0]?.userId).toBe('user_from_session');
    expect(calls[0]?.input).toEqual({ username: 'safe_user' });
    expect(payloads.length).toBe(1);
  });

  it('passes extension client identifier from login headers to service metadata', async () => {
    const calls: Array<{ input: unknown; metadata: unknown }> = [];

    const controller = createAuthController({
      login: async (input: unknown, metadata: unknown) => {
        calls.push({ input, metadata });
        return {
          session: {
            sessionId: 'session_1',
            userId: 'user_1',
            token: 'token_value',
            expiresAt: new Date(Date.now() + 60000),
          },
          user: {
            id: 'user_1',
            username: 'safe_user',
            email: 'safe_user@gmail.com',
            emailVerified: true,
            createdAt: new Date().toISOString(),
          },
        };
      },
    } as never);

    const request = {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'PowerShell-Client',
        'x-octopus-client': 'vscode-extension',
      },
      body: {
        emailOrUsername: 'safe_user@gmail.com',
        password: 'SecurePass123',
      },
    };

    const payloads: unknown[] = [];
    const reply = {
      setCookie: () => reply,
      status: (_code: number) => ({
        send: (payload: unknown) => {
          payloads.push(payload);
          return payload;
        },
      }),
    };

    await controller.login(request as never, reply as never);

    expect(calls.length).toBe(1);
    expect(calls[0]?.metadata).toMatchObject({
      userAgent: 'PowerShell-Client',
      clientIdentifier: 'vscode-extension',
    });
    expect(payloads.length).toBe(1);
  });

  it('uses backend auth context userId for extension connection status', async () => {
    const calls: string[] = [];

    const controller = createAuthController({
      getExtensionConnectionStatus: async (userId: string) => {
        calls.push(userId);
        return {
          connected: true,
          status: 'CONNECTED',
          workspaceName: 'octo',
          projectId: 'project_1',
          projectName: 'octo',
          sessionLastSeenAt: new Date().toISOString(),
        };
      },
    } as never);

    const request = {
      auth: {
        userId: 'user_from_session',
      },
    };

    const payloads: unknown[] = [];
    const reply = {
      status: (_code: number) => ({
        send: (payload: unknown) => {
          payloads.push(payload);
          return payload;
        },
      }),
    };

    await controller.extensionConnection(request as never, reply as never);

    expect(calls[0]).toBe('user_from_session');
    expect(payloads.length).toBe(1);
  });
});
