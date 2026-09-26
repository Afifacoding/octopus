import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadCookieHelpers(nodeEnv: 'development' | 'production') {
  vi.resetModules();
  vi.doMock('../../config/env.js', () => ({
    env: { NODE_ENV: nodeEnv },
  }));

  return import('./auth.cookies.js');
}

describe('session cookie configuration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('uses cross-site-safe attributes in production without setting Domain', async () => {
    const { SESSION_COOKIE_NAME, setSessionCookie } = await loadCookieHelpers('production');
    const setCookie = vi.fn();
    const reply = { setCookie };
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    setSessionCookie(reply as never, 'session-token', expiresAt);

    expect(SESSION_COOKIE_NAME).toBe('octopus_session');
    expect(setCookie).toHaveBeenCalledWith('octopus_session', 'session-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      expires: expiresAt,
    });
    expect(setCookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
  });

  it('keeps development cookies Lax and non-secure', async () => {
    const { setSessionCookie } = await loadCookieHelpers('development');
    const setCookie = vi.fn();

    setSessionCookie({ setCookie } as never, 'session-token', new Date('2030-01-01T00:00:00.000Z'));

    expect(setCookie.mock.calls[0]?.[2]).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(setCookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
  });
});
