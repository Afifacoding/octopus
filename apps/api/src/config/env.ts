import 'dotenv/config';

import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { z } from 'zod';

const DEVELOPMENT_SESSION_SECRET = 'dev-session-secret-please-change-in-production-12345';
const DEVELOPMENT_OTP_SECRET = 'dev-otp-secret-please-change-in-production-123456';

function isValidVaultKey(value: string) {
  const trimmed = value.trim();
  if (/^[a-fA-F0-9]{64}$/u.test(trimmed)) {
    return true;
  }

  return (
    /^[A-Za-z0-9+/]+={0,2}$/u.test(trimmed) && Buffer.from(trimmed, 'base64').byteLength === 32
  );
}

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const createEnvSchema = (port: string | undefined) =>
  z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.preprocess(
      (value) => port?.trim() || value,
      z.coerce.number().int().positive().default(4000),
    ),
    DATABASE_URL: z.string().min(1).default('******localhost:5432/octopus'),
    DIRECT_URL: z.string().optional(),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    AUTH_SESSION_SECRET: z
      .preprocess(emptyToUndefined, z.string().min(32).optional())
      .transform((value) => value ?? DEVELOPMENT_SESSION_SECRET),
    AUTH_OTP_SECRET: z
      .preprocess(emptyToUndefined, z.string().min(32).optional())
      .transform((value) => value ?? DEVELOPMENT_OTP_SECRET),
    AUTH_PASSWORD_SALT_ROUNDS: z.coerce.number().int().min(8).max(14).default(12),
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
    AUTH_OTP_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),
    AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(5),
    AUTH_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    SECRET_VAULT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
    BREVO_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().email().optional()),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    MAX_REQUEST_SIZE_BYTES: z.coerce.number().int().positive().default(52428800),
    SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES: z.coerce.number().int().positive().default(31457280),
    SNAPSHOT_MAX_FILE_COUNT: z.coerce.number().int().positive().default(50000),
    SNAPSHOT_MAX_DIRECTORY_COUNT: z.coerce.number().int().positive().default(10000),
    SNAPSHOT_MAX_PATH_LENGTH: z.coerce.number().int().positive().default(512),
    SNAPSHOT_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(150000000),
    SNAPSHOT_STORAGE_PROVIDER: z.enum(['local']).default('local'),
    SNAPSHOT_STORAGE_LOCAL_ROOT: z.string().min(1).default('.octopus-storage/snapshots'),
    VAULT_ENCRYPTION_KEY: z.string().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  });

export function parseEnvironment(rawEnvironment: NodeJS.ProcessEnv) {
  const parsed = createEnvSchema(rawEnvironment.PORT).safeParse(rawEnvironment);

  if (!parsed.success) {
    throw new Error(`Environment validation failed: ${parsed.error.message}`);
  }

  const envData = parsed.data;

  if (envData.NODE_ENV === 'production') {
    const requiredProductionSettings = [
      'DATABASE_URL',
      'DIRECT_URL',
      'AUTH_SESSION_SECRET',
      'AUTH_OTP_SECRET',
      'BREVO_API_KEY',
      'EMAIL_FROM',
      'VAULT_ENCRYPTION_KEY',
    ] as const;
    const missingSettings = requiredProductionSettings.filter(
      (key) => !rawEnvironment[key]?.trim(),
    );
    if (missingSettings.length > 0) {
      throw new Error(
        `Environment validation failed: ${missingSettings.join(', ')} must be explicitly configured in production`,
      );
    }

    for (const [key, value, developmentDefault] of [
      ['AUTH_SESSION_SECRET', envData.AUTH_SESSION_SECRET, DEVELOPMENT_SESSION_SECRET],
      ['AUTH_OTP_SECRET', envData.AUTH_OTP_SECRET, DEVELOPMENT_OTP_SECRET],
    ] as const) {
      if (
        value === developmentDefault ||
        value.length < 32 ||
        /^(dev|test|change|replace|example|password|secret)[-_ ]/iu.test(value)
      ) {
        throw new Error(
          `Environment validation failed: ${key} must be a strong, non-development secret in production`,
        );
      }
    }
    if (envData.AUTH_SESSION_SECRET === envData.AUTH_OTP_SECRET) {
      throw new Error(
        'Environment validation failed: AUTH_SESSION_SECRET and AUTH_OTP_SECRET must be different',
      );
    }

    for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
      const rawUrl = envData[key];
      if (!rawUrl) {
        throw new Error(
          `Environment validation failed: ${key} must be a PostgreSQL connection URL`,
        );
      }

      let databaseUrl: URL;
      try {
        databaseUrl = new URL(rawUrl);
      } catch {
        throw new Error(
          `Environment validation failed: ${key} must be a valid PostgreSQL connection URL`,
        );
      }
      if (
        !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
        ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)
      ) {
        throw new Error(
          `Environment validation failed: ${key} must point to a non-local PostgreSQL database`,
        );
      }
    }

    const snapshotRoot = path.posix.resolve(
      envData.SNAPSHOT_STORAGE_LOCAL_ROOT.replace(/\\/gu, '/'),
    );
    if (!snapshotRoot.startsWith('/var/data/')) {
      throw new Error(
        'Environment validation failed: SNAPSHOT_STORAGE_LOCAL_ROOT must be under the Render persistent disk mount at /var/data',
      );
    }

    if (!envData.BREVO_API_KEY || !envData.EMAIL_FROM) {
      throw new Error(
        'Environment validation failed: BREVO_API_KEY and EMAIL_FROM are required in production',
      );
    }
  }

  const vaultKey = envData.VAULT_ENCRYPTION_KEY;
  if (!vaultKey || !isValidVaultKey(vaultKey)) {
    if (envData.NODE_ENV === 'test') {
      envData.VAULT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    } else {
      throw new Error(
        'Environment validation failed: VAULT_ENCRYPTION_KEY must encode exactly 32 bytes',
      );
    }
  }

  return envData;
}

export const env = parseEnvironment(process.env);
