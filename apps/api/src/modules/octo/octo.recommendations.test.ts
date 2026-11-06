import { describe, expect, it } from 'vitest';

import { buildProjectRecommendations } from './octo.recommendations.js';
import type { AssistantSourceFile } from './octo.project-intelligence.js';

describe('buildProjectRecommendations', () => {
  it('uses detected project evidence to recommend separate web, API, database and test options', () => {
    const files: AssistantSourceFile[] = [
      {
        path: 'package.json',
        content: JSON.stringify({
          packageManager: 'pnpm@9.0.0',
          dependencies: { react: '^19', vite: '^7', fastify: '^5', '@prisma/client': '^6' },
          devDependencies: { vitest: '^3' },
          scripts: { build: 'vite build' },
        }),
      },
      { path: 'pnpm-lock.yaml', content: 'lockfileVersion: 9' },
      {
        path: 'prisma/schema.prisma',
        content: 'datasource db { provider = "postgresql" }',
      },
      { path: 'src/main.ts', content: 'export const start = () => true;' },
      { path: 'src/view.tsx', content: 'export const View = () => <div />;' },
    ];

    const result = buildProjectRecommendations('project-1', 'snapshot-1', files, 'COMPLETE');

    expect(result.analysisStatus).toBe('COMPLETE');
    expect(result.stack.languages).toEqual(expect.arrayContaining([
      { name: 'TypeScript', fileCount: 2 },
    ]));
    expect(result.stack.frameworks).toEqual(expect.arrayContaining(['React', 'Vite', 'Fastify', 'Prisma Client', 'Vitest']));
    expect(result.stack.packageManagers).toContain('pnpm');
    expect(result.stack.databases).toContain('postgresql');
    expect(result.recommendations.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'vite-static-web',
      'node-api-host',
      'postgres-managed-db',
      'vitest-existing-test-stack',
    ]));
    expect(result.pricingAndAvailability).toBe('NOT_VERIFIED');
    expect(result.recommendations.every((item) => item.evidence.length > 0)).toBe(true);
    expect(result.recommendations.flatMap((item) => item.compatibilityNotes).join(' ')).toContain('No platform was tested');
  });

  it('does not infer database or hosting compatibility from an ORM dependency alone', () => {
    const result = buildProjectRecommendations('project-1', 'snapshot-1', [{
      path: 'package.json',
      content: JSON.stringify({
        dependencies: { prisma: '^6' },
        scripts: { build: 'custom build' },
      }),
    }], 'PARTIAL');

    expect(result.analysisStatus).toBe('PARTIAL');
    expect(result.stack.databases).toContain('Prisma ORM (provider not verified)');
    expect(result.recommendations.map(({ id }) => id)).toEqual(['database-provider-check']);
  });

  it('returns an empty result for malformed or insufficient source evidence without echoing source values', () => {
    const secret = 'do-not-return-this-secret-value';
    const result = buildProjectRecommendations('project-1', 'snapshot-1', [
      { path: 'package.json', content: `{"dependencies":{broken}` },
      { path: 'settings.json', content: JSON.stringify({ token: secret }) },
    ], 'PARTIAL');

    expect(result.recommendations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
