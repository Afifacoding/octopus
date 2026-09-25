import { describe, expect, it } from 'vitest';

import { extractSessionCookie } from './cookie';

describe('cookie extraction', () => {
  it('extracts octopus session cookie', () => {
    const cookie = extractSessionCookie('octopus_session=abc123; Path=/; HttpOnly; SameSite=Lax');
    expect(cookie).toBe('octopus_session=abc123');
  });

  it('returns null when missing session cookie', () => {
    const cookie = extractSessionCookie('other=value; Path=/');
    expect(cookie).toBeNull();
  });
});
