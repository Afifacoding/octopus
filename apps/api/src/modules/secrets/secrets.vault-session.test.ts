import { describe, expect, it } from 'vitest';

import { createVaultSessionToken, readVaultSessionToken } from './secrets.vault-session.js';

describe('vault session token', () => {
  it('creates and validates a vault session token', () => {
    const token = createVaultSessionToken({
      userId: 'user_1',
      projectId: 'project_1',
      ttlSeconds: 60,
    });

    const parsed = readVaultSessionToken(token.token);
    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe('user_1');
    expect(parsed?.projectId).toBe('project_1');
  });

  it('rejects expired vault session token', () => {
    const token = createVaultSessionToken({
      userId: 'user_1',
      projectId: 'project_1',
      ttlSeconds: -1,
    });

    const parsed = readVaultSessionToken(token.token);
    expect(parsed).toBeNull();
  });

  it('rejects tampered token signature', () => {
    const token = createVaultSessionToken({
      userId: 'user_1',
      projectId: 'project_1',
      ttlSeconds: 60,
    });

    const tampered = `${token.token}tampered`;
    expect(readVaultSessionToken(tampered)).toBeNull();
  });
});
