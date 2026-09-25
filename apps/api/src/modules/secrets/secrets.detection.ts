import path from 'node:path';

import yauzl from 'yauzl';

import { HttpError } from '../../core/errors/http-error.js';
import { assertSafeRelativePath } from '../../core/security/secure-file-path.js';
import { maskSecretValue, secretFingerprint } from './secrets.crypto.js';
import { inferSecretCategoryFromKey, shouldInspectForSecretDetection } from './secrets.protection-policy.js';
import type { SecretCategory, SecretConfidence } from './secrets.types.js';

type RawSecretDetection = {
  category: SecretCategory;
  confidence: SecretConfidence;
  detectionRule: string;
  sourceFilePath: string;
  sourceLineNumber: number | null;
  maskedPreview: string;
  fingerprint: string;
  rawValue: string;
  metadata: Record<string, unknown>;
};

type RuleMatch = {
  category: SecretCategory;
  confidence: SecretConfidence;
  detectionRule: string;
  value: string;
  secretLabel: string | null;
};

type DetectionRule = {
  id: string;
  category: SecretCategory;
  confidence: SecretConfidence;
  regex: RegExp;
  valueExtractor?: (line: string, match: RegExpExecArray) => string;
  labelExtractor?: (line: string, match: RegExpExecArray) => string | null;
};

type DetectSecretsOptions = {
  archiveBuffer: Buffer;
  maxPathLength: number;
};

const MAX_FILE_READ_BYTES = 512 * 1024;
const MAX_TOTAL_READ_BYTES = 4 * 1024 * 1024;

const rules: DetectionRule[] = [
  {
    id: 'aws-access-key',
    category: 'CLOUD_CREDENTIAL',
    confidence: 'HIGH',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'stripe-live-key',
    category: 'API_KEY',
    confidence: 'HIGH',
    regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: 'github-token',
    category: 'ACCESS_TOKEN',
    confidence: 'HIGH',
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: 'jwt-token',
    category: 'JWT',
    confidence: 'MEDIUM',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b/g,
  },
  {
    id: 'database-connection-url',
    category: 'DATABASE_URL',
    confidence: 'HIGH',
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"`]+/gi,
  },
  {
    id: 'private-key-block',
    category: 'PRIVATE_KEY',
    confidence: 'HIGH',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    id: 'key-value-secret',
    category: 'SECRET_KEY',
    confidence: 'MEDIUM',
    regex:
      /\b([a-z0-9_.-]*?(?:secret|token|password|api[_-]?key|client[_-]?secret)[a-z0-9_.-]*)\b\s*[:=]\s*['"]?([^\s'"#;]{8,})/gi,
    valueExtractor: (_line, match) => match[2] ?? '',
    labelExtractor: (_line, match) => match[1]?.toUpperCase() ?? null,
  },
  {
    id: 'oauth-client-secret',
    category: 'OAUTH_CLIENT_SECRET',
    confidence: 'MEDIUM',
    regex: /\b(client[_-]?secret)\b\s*[:=]\s*['"]?([^\s'"#;]{8,})/gi,
    valueExtractor: (_line, match) => match[2] ?? '',
    labelExtractor: (_line, match) => match[1]?.toUpperCase() ?? null,
  },
  {
    id: 'webhook-secret',
    category: 'WEBHOOK_SECRET',
    confidence: 'MEDIUM',
    regex: /\b(webhook[_-]?secret)\b\s*[:=]\s*['"]?([^\s'"#;]{8,})/gi,
    valueExtractor: (_line, match) => match[2] ?? '',
    labelExtractor: (_line, match) => match[1]?.toUpperCase() ?? null,
  },
];

function normalizeArchivePath(inputPath: string, maxPathLength: number) {
  if (inputPath.includes('\u0000')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot archive entry contains invalid characters');
  }

  if (/^[a-zA-Z]:/.test(inputPath) || inputPath.startsWith('/') || inputPath.startsWith('\\')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Absolute archive entry paths are not allowed');
  }

  const normalized = assertSafeRelativePath(path.posix.normalize(inputPath.replace(/\\/g, '/')));
  if (normalized === '.' || normalized === '') {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot archive entry path is invalid');
  }

  if (normalized.length > maxPathLength) {
    throw new HttpError(400, 'SNAPSHOT_ENTRY_PATH_TOO_LONG', 'Snapshot entry path is too long');
  }

  return normalized;
}

function shouldInspectPath(filePath: string) {
  return shouldInspectForSecretDetection(filePath);
}

function extractEnvKey(line: string) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1]?.toUpperCase() ?? null;
}

function isLikelyBinary(value: Buffer) {
  if (value.byteLength === 0) {
    return false;
  }

  let nonText = 0;
  for (const byte of value) {
    if (byte === 9 || byte === 10 || byte === 13) {
      continue;
    }

    if (byte < 32 || byte > 126) {
      nonText += 1;
    }
  }

  return nonText / value.byteLength > 0.3;
}

function isPlaceholderValue(value: string) {
  const lower = value.toLowerCase();

  if (lower.length < 8) {
    return true;
  }

  return (
    lower.includes('example') ||
    lower.includes('sample') ||
    lower.includes('placeholder') ||
    lower.includes('dummy') ||
    lower.includes('changeme') ||
    lower.includes('your_') ||
    lower === 'password123' ||
    lower === 'test12345' ||
    lower === 'secret123'
  );
}

function findRuleMatches(line: string): RuleMatch[] {
  const matches: RuleMatch[] = [];

  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let match = rule.regex.exec(line);

    while (match) {
      const matchedText = rule.valueExtractor ? rule.valueExtractor(line, match) : match[0] ?? '';
      if (matchedText.length >= 8 && !isPlaceholderValue(matchedText)) {
        matches.push({
          category: rule.category,
          confidence: rule.confidence,
          detectionRule: rule.id,
          value: matchedText,
          secretLabel: rule.labelExtractor ? rule.labelExtractor(line, match) : null,
        });
      }

      match = rule.regex.exec(line);
    }
  }

  return matches;
}

function detectFromText(filePath: string, content: string): RawSecretDetection[] {
  const lines = content.split(/\r?\n/u);
  const detections: RawSecretDetection[] = [];

  const isDocsLike = filePath.toLowerCase().includes('readme') || filePath.toLowerCase().includes('docs');
  const base = path.posix.basename(filePath.toLowerCase());
  const isEnvFile = base === '.env' || base.startsWith('.env.');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.length < 8) {
      continue;
    }

    if (isDocsLike && /example|sample|placeholder/i.test(line)) {
      continue;
    }

    const matches = findRuleMatches(line);
    const envKey = isEnvFile ? extractEnvKey(line) : null;

    for (const match of matches) {
      const maskedPreview = maskSecretValue(match.value);
      const secretLabel = match.secretLabel ?? envKey;
      const normalizedLabel = typeof secretLabel === 'string' && secretLabel.trim().length > 0 ? secretLabel.trim().toUpperCase() : null;
      const inferredCategory = normalizedLabel ? inferSecretCategoryFromKey(normalizedLabel) : match.category;
      detections.push({
        category: inferredCategory,
        confidence: match.confidence,
        detectionRule: match.detectionRule,
        sourceFilePath: filePath,
        sourceLineNumber: index + 1,
        maskedPreview,
        fingerprint: secretFingerprint([filePath, `${index + 1}`, match.detectionRule, match.value]),
        rawValue: match.value,
        metadata: {
          docsFiltered: false,
          ...(secretLabel ? { secretLabel } : {}),
        },
      });
    }
  }

  return detections;
}

export async function detectSecretsFromArchive(options: DetectSecretsOptions): Promise<RawSecretDetection[]> {
  const detections: RawSecretDetection[] = [];
  let totalRead = 0;

  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      reject(error instanceof HttpError ? error : new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Invalid ZIP archive'));
    };

    yauzl.fromBuffer(options.archiveBuffer, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        fail(openError);
        return;
      }

      zipFile.on('error', (zipError) => {
        zipFile.close();
        fail(zipError);
      });

      zipFile.on('entry', (entry) => {
        let normalizedPath = '';

        try {
          normalizedPath = normalizeArchivePath(entry.fileName, options.maxPathLength);
        } catch (error) {
          zipFile.close();
          fail(error);
          return;
        }

        if (entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }

        if (!shouldInspectPath(normalizedPath)) {
          zipFile.readEntry();
          return;
        }

        if (entry.uncompressedSize > MAX_FILE_READ_BYTES || totalRead >= MAX_TOTAL_READ_BYTES) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            zipFile.close();
            fail(streamError);
            return;
          }

          const chunks: Buffer[] = [];
          let bytes = 0;

          readStream.on('data', (chunk: Buffer) => {
            bytes += chunk.byteLength;
            if (bytes > MAX_FILE_READ_BYTES || totalRead + bytes > MAX_TOTAL_READ_BYTES) {
              readStream.destroy();
              return;
            }

            chunks.push(chunk);
          });

          readStream.on('error', (error) => {
            zipFile.close();
            fail(error);
          });

          readStream.on('end', () => {
            totalRead += bytes;
            const buffer = Buffer.concat(chunks);
            if (!isLikelyBinary(buffer)) {
              const content = buffer.toString('utf8');
              detections.push(...detectFromText(normalizedPath, content));
            }

            zipFile.readEntry();
          });
        });
      });

      zipFile.on('end', () => {
        resolve();
      });

      zipFile.readEntry();
    });
  });

  return detections;
}
