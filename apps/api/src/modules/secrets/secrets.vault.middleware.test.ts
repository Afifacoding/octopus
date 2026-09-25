import { describe, expect, it } from 'vitest';

import { HttpError } from '../../core/errors/http-error.js';
import { createRequireVaultAccess } from './secrets.vault.middleware.js';
import { createVaultSessionToken, VAULT_SESSION_COOKIE_NAME } from './secrets.vault-session.js';

describe('requireVaultAccess middleware', () => {
  const requireVaultAccess = createRequireVaultAccess();

  it('allows requests with valid vault session for same user and project', async () => {
    const token = createVaultSessionToken({
      userId: 'user_1',
      projectId: 'project_1',
      ttlSeconds: 60,
    });

    const request = {
      auth: {
        userId: 'user_1',
        sessionId: 'session_1',
      },
      params: {
        projectId: 'project_1',
      },
      cookies: {
        [VAULT_SESSION_COOKIE_NAME]: token.token,
      },
    };

    await expect(requireVaultAccess(request as never, {} as never)).resolves.toBeUndefined();
  });

  it('rejects requests without vault session cookie', async () => {
    const request = {
      auth: {
        userId: 'user_1',
        sessionId: 'session_1',
      },
      params: {
        projectId: 'project_1',
      },
      cookies: {},
    };

    await expect(requireVaultAccess(request as never, {} as never)).rejects.toMatchObject({
      code: 'VAULT_ACCESS_REQUIRED',
    });
  });

  it('rejects vault session token for different project', async () => {
    const token = createVaultSessionToken({
      userId: 'user_1',
      projectId: 'project_2',
      ttlSeconds: 60,
    });

    const request = {
      auth: {
        userId: 'user_1',
        sessionId: 'session_1',
      },
      params: {
        projectId: 'project_1',
      },
      cookies: {
        [VAULT_SESSION_COOKIE_NAME]: token.token,
      },
    };

    await expect(requireVaultAccess(request as never, {} as never)).rejects.toMatchObject({
      code: 'VAULT_ACCESS_REQUIRED',
    });
  });
});
