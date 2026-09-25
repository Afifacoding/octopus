import 'dotenv/config';

import { randomBytes } from 'node:crypto';

import { z } from 'zod';

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.preprocess((value) => process.env.PORT?.trim() || value, z.coerce.number().int().positive().default(4000)),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/octopus'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_SESSION_SECRET: z.string().min(32).default('dev-session-secret-please-change-in-production-12345'),
  AUTH_OTP_SECRET: z.string().min(32).default('dev-otp-secret-please-change-in-production-123456'),
  AUTH_PASSWORD_SALT_ROUNDS: z.coerce.number().int().min(8).max(14).default(12),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  AUTH_OTP_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),
  AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(5),
  AUTH_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  SECRET_VAULT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
  EMAIL_SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  EMAIL_SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  EMAIL_SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  EMAIL_SMTP_PASS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().email().optional()),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  MAX_REQUEST_SIZE_BYTES: z.coerce.number().int().positive().default(1048576),
  SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES: z.coerce.number().int().positive().default(5242880),
  SNAPSHOT_MAX_FILE_COUNT: z.coerce.number().int().positive().default(50000),
  SNAPSHOT_MAX_DIRECTORY_COUNT: z.coerce.number().int().positive().default(10000),
  SNAPSHOT_MAX_PATH_LENGTH: z.coerce.number().int().positive().default(512),
  SNAPSHOT_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(150000000),
  SNAPSHOT_STORAGE_PROVIDER: z.enum(['local']).default('local'),
  SNAPSHOT_STORAGE_LOCAL_ROOT: z.string().min(1).default('.octopus-storage/snapshots'),
  VAULT_ENCRYPTION_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Environment validation failed: ${parsed.error.message}`);
}

const envData = parsed.data;

if (envData.NODE_ENV === 'production') {
  if (!envData.EMAIL_SMTP_HOST || !envData.EMAIL_SMTP_PORT || !envData.EMAIL_FROM) {
    throw new Error(
      'Environment validation failed: EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, and EMAIL_FROM are required in production',
    );
  }
}

const hasSmtpUser = typeof envData.EMAIL_SMTP_USER === 'string';
const hasSmtpPass = typeof envData.EMAIL_SMTP_PASS === 'string';

if (hasSmtpUser !== hasSmtpPass) {
  throw new Error('Environment validation failed: EMAIL_SMTP_USER and EMAIL_SMTP_PASS must be provided together');
}

const vaultKey = envData.VAULT_ENCRYPTION_KEY;
if (!vaultKey || vaultKey.trim().length < 32) {
  if (envData.NODE_ENV === 'test') {
    envData.VAULT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  } else {
    throw new Error('Environment validation failed: VAULT_ENCRYPTION_KEY must be configured for secret vault encryption');
  }
}

export const env = envData;
