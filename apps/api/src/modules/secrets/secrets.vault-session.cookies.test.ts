import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadVaultCookieHelpers(nodeEnv: 'development' | 'production') {
  vi.resetModules();
  vi.doMock('../../config/env.js', () => ({
    env: { NODE_ENV: nodeEnv, AUTH_SESSION_SECRET: 'test-auth-session-secret-with-sufficient-length' },
  }));

  return import('./secrets.vault-session.js');
}

describe('vault session cookie configuration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('uses Secure, HttpOnly, SameSite=None and host-only scope in production', async () => {
    const { VAULT_SESSION_COOKIE_NAME, setVaultSessionCookie } = await loadVaultCookieHelpers('production');
    const setCookie = vi.fn();
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    setVaultSessionCookie({ setCookie } as never, 'vault-session-token', expiresAt);

    expect(VAULT_SESSION_COOKIE_NAME).toBe('octopus_vault_session');
    expect(setCookie).toHaveBeenCalledWith('octopus_vault_session', 'vault-session-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      expires: expiresAt,
    });
    expect(setCookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
  });

  it('keeps development vault cookies Lax and non-secure', async () => {
    const { setVaultSessionCookie } = await loadVaultCookieHelpers('development');
    const setCookie = vi.fn();

    setVaultSessionCookie({ setCookie } as never, 'vault-session-token', new Date('2030-01-01T00:00:00.000Z'));

    expect(setCookie.mock.calls[0]?.[2]).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(setCookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
  });
});
