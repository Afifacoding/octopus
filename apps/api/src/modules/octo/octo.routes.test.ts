import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const constructed = vi.hoisted(() => ({
  snapshotsServiceArgs: [] as unknown[][],
  secretsServiceArgs: [] as unknown[][],
  storage: { kind: 'storage' },
}));

vi.mock('../snapshots/snapshots.storage.js', () => ({
  createSnapshotStorage: () => constructed.storage,
}));

vi.mock('../snapshots/snapshots.service.js', () => ({
  SnapshotsService: class {
    constructor(...args: unknown[]) {
      constructed.snapshotsServiceArgs.push(args);
    }
  },
}));

vi.mock('../secrets/secrets.service.js', () => ({
  SecretsService: class {
    constructor(...args: unknown[]) {
      constructed.secretsServiceArgs.push(args);
    }
  },
}));

const { SecretsService } = await import('../secrets/secrets.service.js');
const { registerOctoRoutes } = await import('./octo.routes.js');

describe('registerOctoRoutes', () => {
  it('wires Secret Vault auto-import into the snapshots service used for OCTOBOT patches', async () => {
    const app = { get: vi.fn(), post: vi.fn() } as unknown as FastifyInstance;

    await registerOctoRoutes(app);

    expect(constructed.secretsServiceArgs).toHaveLength(1);
    expect(constructed.secretsServiceArgs[0]?.[1]).toBe(constructed.storage);
    expect(constructed.snapshotsServiceArgs).toHaveLength(1);
    const [, storage, secretsService] = constructed.snapshotsServiceArgs[0] ?? [];
    expect(storage).toBe(constructed.storage);
    expect(secretsService).toBeInstanceOf(SecretsService);
  });

  it('registers authenticated intelligence routes and rate-limits snapshot comparison', async () => {
    const get = vi.fn();
    const app = { get, post: vi.fn() } as unknown as FastifyInstance;

    await registerOctoRoutes(app);

    const routes = new Map(get.mock.calls.map((call) => [call[0] as string, call[1] as Record<string, unknown>]));
    for (const path of [
      '/octo/intelligence/projects',
      '/octo/intelligence/projects/:projectId/snapshots',
      '/octo/intelligence/projects/:projectId/snapshots/:snapshotId',
      '/octo/intelligence/projects/:projectId/compare',
    ]) {
      expect(routes.get(path)?.preHandler).toBeTypeOf('function');
    }
    expect(routes.get('/octo/intelligence/projects/:projectId/compare')?.config).toEqual({
      rateLimit: { max: 20, timeWindow: '1 minute' },
    });
  });
});
