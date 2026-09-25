import { describe, expect, it } from 'vitest';

import { decryptSecretValue, encryptSecretValue, maskSecretValue } from './secrets.crypto.js';

describe('secret crypto', () => {
  it('encrypts and decrypts successfully', () => {
    const encrypted = encryptSecretValue('super-secret-value-123');
    const decrypted = decryptSecretValue({
      encryptedValue: encrypted.encryptedValue,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    });

    expect(decrypted).toBe('super-secret-value-123');
  });

  it('produces different ciphertext for repeated encryption', () => {
    const first = encryptSecretValue('same-value');
    const second = encryptSecretValue('same-value');

    expect(first.encryptedValue).not.toBe(second.encryptedValue);
    expect(first.iv).not.toBe(second.iv);
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptSecretValue('do-not-tamper');
    const tampered = `${encrypted.encryptedValue.slice(0, -2)}AA`;

    expect(() =>
      decryptSecretValue({
        encryptedValue: tampered,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      }),
    ).toThrowError();
  });

  it('masks values without exposing plaintext', () => {
    expect(maskSecretValue('sk_live_abcdefghijklmno')).toContain('sk_live_');
    const awsMasked = maskSecretValue('AKIAABCDEFGHIJKLMNOP');
    expect(awsMasked.startsWith('AKIA')).toBe(true);
    expect(awsMasked.endsWith('MNOP')).toBe(true);
    expect(awsMasked.includes('*')).toBe(true);
    expect(maskSecretValue('token-value-123456')).not.toContain('value-123456');
  });
});
