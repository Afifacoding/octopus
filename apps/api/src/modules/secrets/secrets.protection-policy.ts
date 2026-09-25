import path from 'node:path';

import type { SecretCategory } from './secrets.types.js';

export type SecretProtectionClass =
  | 'INTERNAL_SYSTEM_SECRET'
  | 'USER_PROJECT_SECRET'
  | 'SENSITIVE_CONNECTION_DATA'
  | 'NON_SENSITIVE_CONFIGURATION';

const INTERNAL_SYSTEM_KEYS = new Set([
  'SECRET_VAULT_ENCRYPTION_KEY',
  'MASTER_KEY',
  'ENCRYPTION_MASTER_KEY',
  'DATA_ENCRYPTION_KEY',
  'VAULT_ENCRYPTION_KEY',
]);

const NON_SENSITIVE_CONFIG_KEYS = new Set([
  'PORT',
  'NODE_ENV',
  'APP_NAME',
  'LOG_LEVEL',
  'DATABASE_HOST',
  'DATABASE_PORT',
]);

const EXCLUDED_PATH_SEGMENTS = new Set([
  'test',
  'tests',
  '__tests__',
  'fixtures',
  'mocks',
  'examples',
  'sample',
  'samples',
]);

const INSPECTABLE_EXTENSIONS = new Set([
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.conf',
  '.properties',
  '.txt',
]);

function normalizeKeyName(value: string) {
  return value.trim().toUpperCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function isEnvFilePath(filePath: string) {
  const base = path.posix.basename(filePath.replace(/\\/g, '/').toLowerCase());
  return base === '.env' || base.startsWith('.env.');
}

export function shouldInspectForSecretDetection(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  const base = path.posix.basename(normalized);

  if (segments.some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  if (isEnvFilePath(filePath)) {
    return true;
  }

  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(base)) {
    return false;
  }

  if (base.includes('.example.') || base.includes('.sample.')) {
    return false;
  }

  if (base === 'docker-compose.yml' || base === 'docker-compose.yaml') {
    return true;
  }

  return INSPECTABLE_EXTENSIONS.has(path.posix.extname(base));
}

export function classifySecretCandidate(input: { key: string; value?: string | null }): SecretProtectionClass {
  const key = normalizeKeyName(input.key);
  const value = typeof input.value === 'string' ? input.value.trim() : '';

  if (
    INTERNAL_SYSTEM_KEYS.has(key) ||
    key.endsWith('_MASTER_KEY') ||
    key.endsWith('_ENCRYPTION_KEY')
  ) {
    return 'INTERNAL_SYSTEM_SECRET';
  }

  if (NON_SENSITIVE_CONFIG_KEYS.has(key)) {
    return 'NON_SENSITIVE_CONFIGURATION';
  }

  if (key === 'DATABASE_URL' || key.endsWith('_DATABASE_URL') || key.endsWith('_URI') || key.endsWith('_URL')) {
    if (includesAny(key, ['DATABASE', 'MONGO', 'REDIS', 'POSTGRES', 'MYSQL'])) {
      return 'SENSITIVE_CONNECTION_DATA';
    }
  }

  if (includesAny(key, ['PASSWORD', 'DATABASE_URL', 'MONGO_URI', 'REDIS_URL', 'AWS_SECRET_ACCESS_KEY', 'AZURE_CLIENT_SECRET', 'GOOGLE_APPLICATION_CREDENTIALS'])) {
    return 'SENSITIVE_CONNECTION_DATA';
  }

  if (
    includesAny(key, [
      'JWT_SECRET',
      'AUTH_SESSION_SECRET',
      'AUTH_OTP_SECRET',
      'API_KEY',
      'TOKEN',
      'WEBHOOK_SECRET',
      'STRIPE_SECRET_KEY',
      'SENDGRID_API_KEY',
      'TWILIO_AUTH_TOKEN',
      'OPENAI_API_KEY',
      'GEMINI_API_KEY',
      'GITHUB_TOKEN',
      'REFRESH_TOKEN',
      'ACCESS_TOKEN',
      'SECRET',
      'PRIVATE_KEY',
      'CLIENT_SECRET',
    ])
  ) {
    return 'USER_PROJECT_SECRET';
  }

  if (value.length > 0 && value.length < 8 && NON_SENSITIVE_CONFIG_KEYS.has(key)) {
    return 'NON_SENSITIVE_CONFIGURATION';
  }

  return 'NON_SENSITIVE_CONFIGURATION';
}

export function shouldMaskForSnapshot(input: { key: string; value?: string | null }) {
  const category = classifySecretCandidate(input);
  return category !== 'NON_SENSITIVE_CONFIGURATION';
}

export function shouldFullyMaskValue(input: { key: string; value?: string | null }) {
  return classifySecretCandidate(input) === 'INTERNAL_SYSTEM_SECRET';
}

export function canAutoImportToVault(input: { key: string; value: string; sourceFilePath: string }) {
  if (!isEnvFilePath(input.sourceFilePath)) {
    return false;
  }

  const classification = classifySecretCandidate({ key: input.key, value: input.value });
  if (classification === 'INTERNAL_SYSTEM_SECRET' || classification === 'NON_SENSITIVE_CONFIGURATION') {
    return false;
  }

  return input.value.trim().length >= 8;
}

export function canExposeThroughVault(input: { label: string }) {
  return classifySecretCandidate({ key: input.label }) !== 'INTERNAL_SYSTEM_SECRET';
}

export function inferSecretCategoryFromKey(key: string): SecretCategory {
  const normalized = normalizeKeyName(key);

  if (normalized.includes('DATABASE_URL') || normalized.includes('MONGO_URI') || normalized.includes('REDIS_URL')) {
    return 'DATABASE_URL';
  }

  if (normalized.includes('JWT')) {
    return 'JWT';
  }

  if (normalized.includes('WEBHOOK')) {
    return 'WEBHOOK_SECRET';
  }

  if (normalized.includes('PRIVATE_KEY')) {
    return 'PRIVATE_KEY';
  }

  if (normalized.includes('ACCESS_TOKEN') || normalized.includes('REFRESH_TOKEN') || normalized.endsWith('_TOKEN')) {
    return 'ACCESS_TOKEN';
  }

  if (normalized.includes('OAUTH') && normalized.includes('SECRET')) {
    return 'OAUTH_CLIENT_SECRET';
  }

  if (
    normalized.includes('AWS') ||
    normalized.includes('AZURE') ||
    normalized.includes('GCP') ||
    normalized.includes('GOOGLE_APPLICATION_CREDENTIALS')
  ) {
    return 'CLOUD_CREDENTIAL';
  }

  if (normalized.includes('PASSWORD')) {
    return 'PASSWORD';
  }

  if (normalized.includes('API_KEY') || normalized.endsWith('_KEY') || normalized.includes('STRIPE')) {
    return 'API_KEY';
  }

  return 'SECRET_KEY';
}
