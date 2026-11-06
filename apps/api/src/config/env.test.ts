import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env.js';

const productionEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://octopus:placeholder@db.example.com:5432/octopus',
  DIRECT_URL: 'postgresql://octopus:placeholder@db.example.com:5432/octopus',
  CORS_ORIGIN: 'https://octopus-web-r33z.onrender.com',
  AUTH_SESSION_SECRET: 'session-value-that-is-long-enough-123456',
  AUTH_OTP_SECRET: 'otp-value-that-is-also-long-enough-654321',
  BREVO_API_KEY: 'test-provider-key',
  EMAIL_FROM: 'noreply@example.com',
  VAULT_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  SNAPSHOT_STORAGE_LOCAL_ROOT: '/var/data/snapshots',
};

describe('parseEnvironment production validation', () => {
  it('accepts explicitly configured production secrets, database URLs, and Render disk path', () => {
    const result = parseEnvironment(productionEnvironment);

    expect(result.NODE_ENV).toBe('production');
    expect(result.SNAPSHOT_STORAGE_LOCAL_ROOT).toBe('/var/data/snapshots');
  });

  it.each([
    ['DATABASE_URL', undefined],
    ['DIRECT_URL', undefined],
    ['AUTH_SESSION_SECRET', undefined],
    ['AUTH_SESSION_SECRET', 'dev-session-secret-please-change-in-production-12345'],
    ['AUTH_OTP_SECRET', undefined],
    ['AUTH_OTP_SECRET', 'dev-otp-secret-please-change-in-production-123456'],
    ['BREVO_API_KEY', undefined],
    ['EMAIL_FROM', undefined],
    ['VAULT_ENCRYPTION_KEY', undefined],
    ['VAULT_ENCRYPTION_KEY', 'not-a-32-byte-vault-key-configuration'],
    ['SNAPSHOT_STORAGE_LOCAL_ROOT', '.octopus-storage/snapshots'],
  ] as const)('rejects invalid production configuration for %s', (key, value) => {
    const environment = { ...productionEnvironment };
    if (value === undefined) {
      delete environment[key];
    } else {
      environment[key] = value;
    }

    expect(() => parseEnvironment(environment)).toThrow();
  });

  it('rejects identical production authentication secrets', () => {
    const environment = {
      ...productionEnvironment,
      AUTH_OTP_SECRET: productionEnvironment.AUTH_SESSION_SECRET,
    };

    expect(() => parseEnvironment(environment)).toThrow(/must be different/iu);
  });

  it('preserves local development defaults', () => {
    const result = parseEnvironment({
      NODE_ENV: 'development',
      VAULT_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      AUTH_SESSION_SECRET: '',
      AUTH_OTP_SECRET: '',
    });

    expect(result.AUTH_SESSION_SECRET).toBe('dev-session-secret-please-change-in-production-12345');
    expect(result.DATABASE_URL).toContain('localhost');
  });
});
