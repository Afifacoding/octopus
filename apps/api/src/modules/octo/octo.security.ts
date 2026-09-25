/**
 * Octo Security Layer
 * Prevents Octo from accessing or revealing secrets, passwords, tokens, and other sensitive data
 */

import type { OctoIntentMatch } from './octo.types.js';

// List of sensitive keywords that trigger blocking
const SENSITIVE_KEYWORDS = [
  // Passwords
  'password',
  'passwd',
  'pwd',
  'pass',
  'secret',
  'credentials',
  'credential',
  // Tokens & Auth
  'token',
  'jwt',
  'bearer',
  'api.key',
  'apikey',
  'api_key',
  'access.token',
  'accesstoken',
  'access_token',
  'refresh.token',
  'refreshtoken',
  'refresh_token',
  'session.token',
  'sessiontoken',
  'session_token',
  'auth.token',
  'authtoken',
  'auth_token',
  // Keys & Encryption
  'private.key',
  'privatekey',
  'private_key',
  'encryption.key',
  'encryptionkey',
  'encryption_key',
  'rsa.key',
  'rsakey',
  'rsa_key',
  'ssl.key',
  'sslkey',
  'ssl_key',
  'certificate.key',
  'certificatekey',
  'certificate_key',
  // Database & Infrastructure
  'database.password',
  'database_password',
  'db.password',
  'db_password',
  'connection.string',
  'connectionstring',
  'connection_string',
  'master.key',
  'masterkey',
  'master_key',
  // OTP & 2FA
  'otp',
  'one.time.password',
  'onetime.password',
  'one_time_password',
  '2fa',
  'two.factor',
  'twofactor',
  'two_factor',
  'mfa',
  'multi.factor',
  'multifactor',
  'multi_factor',
  // Other Secrets
  'secret.vault',
  'secretvault',
  'secret_vault',
  'vault.value',
  'vault_value',
  'vault.secret',
  'vault_secret',
  'crypto',
  'cryptography',
  'cipher',
  'hash',
  // Web/API specific
  'cookie',
  'cookies',
  'session',
  'auth',
  'authorization',
  'oauth',
  'openid',
  'saml',
  'fingerprint',
];

/**
 * Check if a question contains sensitive keywords that should be blocked
 */
export function isBlockedSensitiveRequest(question: string): boolean {
  const normalized = question.toLowerCase().replace(/[^a-z0-9.\s]/g, '');
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Block certain intents that request sensitive information
 */
export function isBlockedIntent(intent: string): boolean {
  const blockedIntents = [
    'BLOCK_PASSWORD_REQUEST',
    'BLOCK_API_KEY_REQUEST',
    'BLOCK_SECRET_REQUEST',
    'BLOCK_TOKEN_REQUEST',
  ];
  return blockedIntents.includes(intent);
}

/**
 * Sanitize text to remove accidental sensitive patterns
 * Masks things like: PASSWORD=xxx, API_KEY=xxx, etc.
 */
export function sanitizeTextForOcto(text: string): string {
  // Mask assignment patterns
  const patterns = [
    /password\s*[:=]\s*[^\s,;]+/gi,
    /api[_-]?key\s*[:=]\s*[^\s,;]+/gi,
    /secret\s*[:=]\s*[^\s,;]+/gi,
    /token\s*[:=]\s*[^\s,;]+/gi,
    /cookie\s*[:=]\s*[^\s,;]+/gi,
    /auth\s*[:=]\s*[^\s,;]+/gi,
  ];

  let sanitized = text;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}

/**
 * Determine if a question should be blocked and what response to give
 */
export function checkSecurityBoundary(
  question: string,
  intentMatch: OctoIntentMatch,
): { isBlocked: boolean; message?: string } {
  // Check for sensitive keywords
  if (isBlockedSensitiveRequest(question)) {
    const intent = intentMatch.intent;

    if (
      intent.includes('PASSWORD') ||
      question.toLowerCase().includes('password') ||
      question.toLowerCase().includes('passwd')
    ) {
      return {
        isBlocked: true,
        message: "I can't access or reveal account passwords. For account security issues, please check your profile settings.",
      };
    }

    if (
      intent.includes('API_KEY') ||
      intent.includes('API KEY') ||
      question.toLowerCase().includes('api key') ||
      question.toLowerCase().includes('apikey')
    ) {
      return {
        isBlocked: true,
        message: "I can't provide API keys or credentials. Please manage these through Secret Vault.",
      };
    }

    if (
      intent.includes('SECRET') ||
      question.toLowerCase().includes('secret') ||
      question.toLowerCase().includes('vault')
    ) {
      return {
        isBlocked: true,
        message: "I can't access secret values. You can view and manage your secrets through Secret Vault.",
      };
    }

    if (
      intent.includes('TOKEN') ||
      question.toLowerCase().includes('token') ||
      question.toLowerCase().includes('jwt') ||
      question.toLowerCase().includes('bearer')
    ) {
      return {
        isBlocked: true,
        message: "I can't provide authentication tokens or session credentials. These are protected for your security.",
      };
    }

    // Generic security block
    return {
      isBlocked: true,
      message: "I can't access sensitive credentials or secrets. For security-related questions, please visit Secret Vault or your account settings.",
    };
  }

  // Check for blocked intents
  if (isBlockedIntent(intentMatch.intent)) {
    return {
      isBlocked: true,
      message: "I can't access that information. It's protected for your security.",
    };
  }

  return { isBlocked: false };
}
