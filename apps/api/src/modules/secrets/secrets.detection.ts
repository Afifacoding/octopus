import path from 'node:path';

import yauzl from 'yauzl';

import { HttpError } from '../../core/errors/http-error.js';
import { assertSafeRelativePath } from '../../core/security/secure-file-path.js';
import { maskSecretValue, secretFingerprint } from './secrets.crypto.js';
import { inferSecretCategoryFromKey, shouldInspectForSecretDetection } from './secrets.protection-policy.js';
import type { SecretCategory, SecretConfidence } from './secrets.types.js';
import { env } from '../../config/env.js';

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

const MAX_FILE_READ_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_READ_BYTES = env.SNAPSHOT_MAX_TOTAL_BYTES;

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
    id: 'github-fine-grained-token',
    category: 'ACCESS_TOKEN',
    confidence: 'HIGH',
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    id: 'gitlab-token',
    category: 'ACCESS_TOKEN',
    confidence: 'HIGH',
    regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'slack-token',
    category: 'ACCESS_TOKEN',
    confidence: 'HIGH',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: 'google-api-key',
    category: 'API_KEY',
    confidence: 'HIGH',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: 'npm-token',
    category: 'ACCESS_TOKEN',
    confidence: 'HIGH',
    regex: /\bnpm_[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: 'stripe-restricted-key',
    category: 'API_KEY',
    confidence: 'HIGH',
    regex: /\brk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: 'openai-project-key',
    category: 'API_KEY',
    confidence: 'HIGH',
    regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
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
    id: 'key-value-secret',
    category: 'SECRET_KEY',
    confidence: 'MEDIUM',
    regex:
      /\b([a-z0-9_.-]*?(?:secret|token|password|api[_-]?key|access[_-]?key|account[_-]?key|private[_-]?key|client[_-]?secret)[a-z0-9_.-]*)\b\s*[:=]\s*['"]?([^\s'"#;]{8,})/gi,
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

const LABEL_BY_RULE: Record<string, string> = {
  'aws-access-key': 'AWS_ACCESS_KEY_ID',
  'database-connection-url': 'DATABASE_URL',
  'github-fine-grained-token': 'GITHUB_TOKEN',
  'github-token': 'GITHUB_TOKEN',
  'gitlab-token': 'GITLAB_TOKEN',
  'google-api-key': 'GOOGLE_API_KEY',
  'jwt-token': 'JWT_TOKEN',
  'npm-token': 'NPM_TOKEN',
  'openai-project-key': 'OPENAI_API_KEY',
  'private-key-block': 'PRIVATE_KEY',
  'slack-token': 'SLACK_TOKEN',
  'stripe-live-key': 'STRIPE_SECRET_KEY',
  'stripe-restricted-key': 'STRIPE_RESTRICTED_KEY',
};

export function getSuggestedSecretLabel(detectionRule: string) {
  return LABEL_BY_RULE[detectionRule] ?? null;
}

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
  const seenValues = new Set<string>();

  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let match = rule.regex.exec(line);

    while (match) {
      const matchedText = rule.valueExtractor ? rule.valueExtractor(line, match) : match[0] ?? '';
      const isPrivateKeyHeaderOnly = /^-----BEGIN [A-Z ]*PRIVATE KEY-----$/u.test(matchedText);
      if (
        matchedText.length >= 8 &&
        !isPlaceholderValue(matchedText) &&
        !isPrivateKeyHeaderOnly &&
        !seenValues.has(matchedText)
      ) {
        seenValues.add(matchedText);
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
  const privateKeyPattern = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]+?-----END \1-----/gu;
  let privateKeyMatch: RegExpExecArray | null;

  while ((privateKeyMatch = privateKeyPattern.exec(content)) !== null) {
    const rawValue = privateKeyMatch[0];
    if (isPlaceholderValue(rawValue)) {
      continue;
    }

    const sourceLineNumber = content.slice(0, privateKeyMatch.index).split(/\r?\n/u).length;
    const keyType = privateKeyMatch[1]?.replace(/\s+/gu, '_') ?? 'PRIVATE_KEY';
    detections.push({
      category: 'PRIVATE_KEY',
      confidence: 'HIGH',
      detectionRule: 'private-key-block',
      sourceFilePath: filePath,
      sourceLineNumber,
      maskedPreview: `-----BEGIN ${privateKeyMatch[1]}----- [REDACTED] -----END ${privateKeyMatch[1]}-----`,
      fingerprint: secretFingerprint([filePath, `${sourceLineNumber}`, 'private-key-block', rawValue]),
      rawValue,
      metadata: { docsFiltered: false, secretLabel: keyType },
    });
  }

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

        if (entry.uncompressedSize > MAX_FILE_READ_BYTES || totalRead + entry.uncompressedSize > MAX_TOTAL_READ_BYTES) {
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
