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
        content: 'API_KEY=sk_test_fake_0123456789abcdef',
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

  it('detects common provider credentials in project source files', async () => {
    const zip = await createZipBuffer([
      {
        path: 'project/src/config.ts',
        content: [
          `const google = "AIza${'A'.repeat(35)}";`,
          `const slack = "xoxb-1234567890-${'a'.repeat(24)}";`,
          `const gitlab = "glpat-${'b'.repeat(24)}";`,
          `const github = "github_pat_${'c'.repeat(32)}";`,
          `const npm = "npm_${'d'.repeat(30)}";`,
          `const stripe = "rk_live_${'E'.repeat(20)}";`,
          `const openai = "sk-proj-${'f'.repeat(32)}";`,
        ].join('\n'),
      },
    ]);

    const detections = await detectSecretsFromArchive({ archiveBuffer: zip, maxPathLength: 512 });
    const detectionRules = detections.map((item) => item.detectionRule);

    expect(detections).toHaveLength(7);
    expect(detectionRules).toEqual(expect.arrayContaining([
      'google-api-key',
      'slack-token',
      'gitlab-token',
      'github-fine-grained-token',
      'npm-token',
      'stripe-restricted-key',
      'openai-project-key',
    ]));
    expect(detections.every((item) => item.sourceFilePath === 'project/src/config.ts')).toBe(true);
  });

  it('detects complete PEM private-key blocks with a bounded masked preview', async () => {
    const privateKey = '-----BEGIN PRIVATE KEY-----\nFAKE_KEY_MATERIAL_0123456789\n-----END PRIVATE KEY-----';
    const zip = await createZipBuffer([
      { path: 'project/keys/private.pem', content: privateKey },
    ]);

    const detections = await detectSecretsFromArchive({ archiveBuffer: zip, maxPathLength: 512 });
    const privateKeyDetection = detections.find((item) => item.detectionRule === 'private-key-block');

    expect(privateKeyDetection?.rawValue).toBe(privateKey);
    expect(privateKeyDetection?.metadata.secretLabel).toBe('PRIVATE_KEY');
    expect(privateKeyDetection?.maskedPreview).not.toContain('FAKE_KEY_MATERIAL');
    expect((privateKeyDetection?.maskedPreview ?? '').length).toBeLessThan(128);
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
