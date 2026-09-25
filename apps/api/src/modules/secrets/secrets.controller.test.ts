import { describe, expect, it, vi } from 'vitest';

import { createSecretsController } from './secrets.controller.js';

describe('Secrets controller vault access', () => {
  it('rejects vault unlock with invalid password', async () => {
    const auditFailed = vi.fn(async () => undefined);

    const controller = createSecretsController(
      {
        assertProjectAccess: async () => undefined,
        auditVaultUnlockFailed: auditFailed,
      } as never,
      {
        verifyCurrentUserPassword: async () => false,
      } as never,
    );

    await expect(
      controller.unlockVault(
        {
          auth: {
            userId: 'user_1',
            sessionId: 'session_1',
          },
          params: {
            projectId: 'project_1',
          },
          body: {
            password: 'wrong-password',
          },
        } as never,
        {
          setCookie: () => undefined,
          status: () => ({ send: () => undefined }),
        } as never,
      ),
    ).rejects.toMatchObject({
      code: 'VAULT_UNLOCK_FAILED',
    });

    expect(auditFailed).toHaveBeenCalledTimes(1);
  });

  it('unlocks vault when password is valid', async () => {
    const setCookie = vi.fn();

    const controller = createSecretsController(
      {
        assertProjectAccess: async () => undefined,
        auditVaultUnlocked: async () => undefined,
      } as never,
      {
        verifyCurrentUserPassword: async () => true,
      } as never,
    );

    await controller.unlockVault(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
        },
        body: {
          password: 'valid-password',
        },
      } as never,
      {
        setCookie,
        status: () => ({ send: () => undefined }),
      } as never,
    );

    expect(setCookie).toHaveBeenCalledTimes(1);
  });
});

describe('Secrets controller permanent delete', () => {
  it('rejects unauthenticated delete requests', async () => {
    const deleteSecret = vi.fn(async () => ({ secretId: 'secret_1', deleted: true }));

    const controller = createSecretsController({ deleteSecret } as never, {} as never);

    await expect(
      controller.deleteById(
        {
          params: { projectId: 'project_1', secretId: 'secret_1' },
        } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

    expect(deleteSecret).not.toHaveBeenCalled();
  });

  it('passes the authenticated owner through and returns no secret material', async () => {
    const calls: Array<{ ownerId: string; projectId: string; secretId: string }> = [];
    let payload: unknown = null;

    const controller = createSecretsController(
      {
        deleteSecret: async (ownerId: string, projectId: string, secretId: string) => {
          calls.push({ ownerId, projectId, secretId });
          return { secretId, deleted: true };
        },
      } as never,
      {} as never,
    );

    await controller.deleteById(
      {
        auth: { userId: 'user_1', sessionId: 'session_1' },
        params: { projectId: 'project_1', secretId: 'secret_1' },
      } as never,
      {
        status: () => ({
          send: (body: unknown) => {
            payload = body;
            return undefined;
          },
        }),
      } as never,
    );

    expect(calls[0]).toEqual({ ownerId: 'user_1', projectId: 'project_1', secretId: 'secret_1' });
    expect(payload).toEqual({
      success: true,
      data: { secretId: 'secret_1', deleted: true },
    });
    expect(JSON.stringify(payload)).not.toContain('encrypted');
  });
});
