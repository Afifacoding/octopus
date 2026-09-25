import { describe, expect, it } from 'vitest';
import yazl from 'yazl';

import { detectSecretsFromArchive } from './secrets.detection.js';

async function createZipBuffer(entries: Array<{ path: string; content: Buffer | string }>) {
  const zipFile = new yazl.ZipFile();

  for (const entry of entries) {
    const content = typeof entry.content === 'string' ? Buffer.from(entry.content) : entry.content;
    zipFile.addBuffer(content, entry.path);
  }

  zipFile.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zipFile.outputStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

describe('detectSecretsFromArchive', () => {
  it('detects known secret patterns with masked previews', async () => {
    const zip = await createZipBuffer([
      {
        path: 'project/.env',
        content: 'STRIPE_KEY=sk_live_abcdefghijklmnop\nDATABASE_URL=postgres://user:pass@localhost:5432/db',
      },
    ]);

    const detections = await detectSecretsFromArchive({
      archiveBuffer: zip,
      maxPathLength: 512,
    });

    expect(detections.length).toBeGreaterThan(1);
    expect(detections.some((item) => item.category === 'API_KEY')).toBe(true);
    expect(detections.every((item) => !item.maskedPreview.includes('abcdefghijklmnop'))).toBe(true);
  });

  it('ignores obvious placeholder values', async () => {
    const zip = await createZipBuffer([
      {
        path: 'project/.env.example',
        content: 'API_KEY=example-placeholder-value\nPASSWORD=password123',
      },
    ]);

    const detections = await detectSecretsFromArchive({
      archiveBuffer: zip,
      maxPathLength: 512,
    });

    expect(detections).toHaveLength(0);
  });

  it('skips binary-like files safely', async () => {
    const binary = Buffer.alloc(2048, 0);
    const zip = await createZipBuffer([
      {
        path: 'project/secrets.bin',
        content: binary,
      },
    ]);

    const detections = await detectSecretsFromArchive({
      archiveBuffer: zip,
      maxPathLength: 512,
    });

    expect(detections).toHaveLength(0);
  });

  it('detects env secrets from .env.local and .env.production with key labels', async () => {
    const zip = await createZipBuffer([
      {
        path: 'project/.env.local',
        content: 'DATABASE_PASSWORD=myActualPassword123\nAUTH_SESSION_SECRET=session_secret_12345',
      },
      {
        path: 'project/.env.production',
        content: 'API_KEY=TEST_API_KEY_PLACEHOLDER',
      },
    ]);

    const detections = await detectSecretsFromArchive({
      archiveBuffer: zip,
      maxPathLength: 512,
    });

    expect(detections.some((item) => item.metadata.secretLabel === 'DATABASE_PASSWORD')).toBe(true);
    expect(detections.some((item) => item.metadata.secretLabel === 'AUTH_SESSION_SECRET')).toBe(true);
    expect(detections.some((item) => item.metadata.secretLabel === 'API_KEY')).toBe(true);
  });

  it('does not detect source-code identifiers or test fixtures as secrets', async () => {
    const zip = await createZipBuffer([
      {
        path: 'project/src/services/secrets.service.ts',
        content: 'const updateSecretSchema = {};\nthis.secrets = [];\nconst label = secret.label;\n',
      },
      {
        path: 'project/tests/secrets.detection.test.ts',
        content: 'const API_KEY = "sk_live_fake_test_value_123456";',
      },
      {
        path: 'project/tests/.env',
        content: 'AUTH_SESSION_SECRET=fixture_session_secret_123456',
      },
      {
        path: 'project/__tests__/fixtures/sample.env.txt',
        content: 'DATABASE_URL=postgresql://fixture:fixture@localhost:5432/fixturedb',
      },
    ]);

    const detections = await detectSecretsFromArchive({
      archiveBuffer: zip,
      maxPathLength: 512,
    });

    expect(detections).toHaveLength(0);
  });
});
