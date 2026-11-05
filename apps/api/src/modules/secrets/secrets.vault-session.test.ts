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

  it('rejects a same-length forged signature', () => {
    const token = createVaultSessionToken({ userId: 'user_1', projectId: 'project_1', ttlSeconds: 60 });
    const [payload, signature] = token.token.split('.');
    const forgedSignature = `${signature!.slice(0, -1)}${signature!.endsWith('A') ? 'B' : 'A'}`;

    expect(readVaultSessionToken(`${payload}.${forgedSignature}`)).toBeNull();
  });

  it('rejects a payload swapped onto another token signature', () => {
    const victim = createVaultSessionToken({ userId: 'user_1', projectId: 'project_1', ttlSeconds: 60 });
    const attacker = createVaultSessionToken({ userId: 'user_2', projectId: 'project_2', ttlSeconds: 60 });
    const [victimPayload] = victim.token.split('.');
    const [, attackerSignature] = attacker.token.split('.');

    expect(readVaultSessionToken(`${victimPayload}.${attackerSignature}`)).toBeNull();
  });
});
