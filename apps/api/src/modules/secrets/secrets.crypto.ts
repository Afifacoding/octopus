import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';
import { HttpError } from '../../core/errors/http-error.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SNAPSHOT_ARCHIVE_MAGIC = Buffer.from('OCTOARCH');
const SNAPSHOT_ARCHIVE_HEADER_LENGTH = SNAPSHOT_ARCHIVE_MAGIC.length + IV_LENGTH + 16;

function parseVaultKey(rawValue: string | undefined) {
  if (!rawValue) {
    throw new HttpError(500, 'VAULT_KEY_MISSING', 'Vault encryption key is missing');
  }

  const trimmed = rawValue.trim();

  try {
    const asBase64 = Buffer.from(trimmed, 'base64');
    if (asBase64.byteLength === 32) {
      return asBase64;
    }
  } catch {
    // Continue to other formats.
  }

  if (/^[a-fA-F0-9]{64}$/u.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  throw new HttpError(500, 'VAULT_KEY_INVALID', 'Vault encryption key is invalid');
}

const vaultKey = parseVaultKey(env.VAULT_ENCRYPTION_KEY);

export type EncryptedSecret = {
  encryptedValue: string;
  iv: string;
  authTag: string;
  encryptionVersion: 'v1';
};

export function encryptSecretValue(plaintext: string): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, vaultKey, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptionVersion: 'v1',
  };
}

export function decryptSecretValue(input: { encryptedValue: string; iv: string; authTag: string }) {
  try {
    const decipher = createDecipheriv(ALGORITHM, vaultKey, Buffer.from(input.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(input.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(input.encryptedValue, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    throw new HttpError(500, 'SECRET_DECRYPT_FAILED', 'Secret decryption failed');
  }
}

export function encryptSnapshotArchive(plaintext: Buffer) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, vaultKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return Buffer.concat([SNAPSHOT_ARCHIVE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptSnapshotArchive(stored: Buffer) {
  if (!stored.subarray(0, SNAPSHOT_ARCHIVE_MAGIC.length).equals(SNAPSHOT_ARCHIVE_MAGIC)) {
    return stored;
  }

  if (stored.byteLength < SNAPSHOT_ARCHIVE_HEADER_LENGTH) {
    throw new HttpError(500, 'SNAPSHOT_ARCHIVE_DECRYPT_FAILED', 'Snapshot archive decryption failed');
  }

  try {
    const ivStart = SNAPSHOT_ARCHIVE_MAGIC.length;
    const tagStart = ivStart + IV_LENGTH;
    const cipherStart = tagStart + 16;
    const decipher = createDecipheriv(ALGORITHM, vaultKey, stored.subarray(ivStart, tagStart));
    decipher.setAuthTag(stored.subarray(tagStart, cipherStart));
    return Buffer.concat([decipher.update(stored.subarray(cipherStart)), decipher.final()]);
  } catch {
    throw new HttpError(500, 'SNAPSHOT_ARCHIVE_DECRYPT_FAILED', 'Snapshot archive decryption failed');
  }
}

export function maskSecretValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return '****';
  }

  if (trimmed.startsWith('sk_live_')) {
    return `sk_live_${'*'.repeat(Math.min(32, Math.max(4, trimmed.length - 8)))}${trimmed.slice(-4)}`;
  }

  if (/^AKIA[0-9A-Z]{16}$/u.test(trimmed)) {
    return `${trimmed.slice(0, 4)}${'*'.repeat(12)}${trimmed.slice(-4)}`;
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 1)}${'*'.repeat(trimmed.length - 2)}${trimmed.slice(-1)}`;
  }

  return `${trimmed.slice(0, 4)}${'*'.repeat(Math.min(32, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

export function secretFingerprint(parts: string[]) {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
