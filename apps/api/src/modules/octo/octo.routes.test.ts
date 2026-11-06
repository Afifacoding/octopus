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
    const app = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as unknown as FastifyInstance;

    await registerOctoRoutes(app);

    expect(constructed.secretsServiceArgs).toHaveLength(1);
    expect(constructed.secretsServiceArgs[0]?.[1]).toBe(constructed.storage);
    expect(constructed.snapshotsServiceArgs).toHaveLength(1);
    const [, storage, secretsService] = constructed.snapshotsServiceArgs[0] ?? [];
    expect(storage).toBe(constructed.storage);
    expect(secretsService).toBeInstanceOf(SecretsService);
  });

  it('authenticates and rate-limits the direct OCTOBOT ask endpoint', async () => {
    const post = vi.fn();
    const app = { get: vi.fn(), post, patch: vi.fn(), delete: vi.fn() } as unknown as FastifyInstance;

    await registerOctoRoutes(app);

    const route = post.mock.calls.find((call) => call[0] === '/octo/ask');
    expect(route?.[1]).toMatchObject({
      preHandler: expect.any(Function),
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    });
  });

  it('registers authenticated intelligence routes and rate-limits snapshot comparison', async () => {
    const get = vi.fn();
    const app = { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as unknown as FastifyInstance;

    await registerOctoRoutes(app);

    const routes = new Map(get.mock.calls.map((call) => [call[0] as string, call[1] as Record<string, unknown>]));
    expect(routes.get('/octo/models')?.preHandler).toBeTypeOf('function');
    for (const path of [
      '/octo/intelligence/projects',
      '/octo/intelligence/projects/:projectId/snapshots',
      '/octo/intelligence/projects/:projectId/snapshots/:snapshotId',
      '/octo/intelligence/projects/:projectId/compare',
      '/octo/recommendations',
    ]) {
      expect(routes.get(path)?.preHandler).toBeTypeOf('function');
    }
    expect(routes.get('/octo/intelligence/projects/:projectId/compare')?.config).toEqual({
      rateLimit: { max: 20, timeWindow: '1 minute' },
    });
    expect(routes.get('/octo/recommendations')?.config).toEqual({
      rateLimit: { max: 10, timeWindow: '1 minute' },
    });
  });

  it('registers authenticated, rate-limited Graphify routes', async () => {
    const get = vi.fn();
    const app = { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as unknown as FastifyInstance;

    await registerOctoRoutes(app);

    const routes = new Map(get.mock.calls.map((call) => [call[0] as string, call[1] as Record<string, unknown>]));
    const graphRoute = routes.get('/octo/graph');
    const searchRoute = routes.get('/octo/graphify/search');
    expect(graphRoute?.preHandler).toBeTypeOf('function');
    expect(searchRoute?.preHandler).toBeTypeOf('function');
    expect(graphRoute?.config).toEqual({ rateLimit: { max: 10, timeWindow: '1 minute' } });
    expect(searchRoute?.config).toEqual({ rateLimit: { max: 20, timeWindow: '1 minute' } });
  });

  it('registers authenticated conversation CRUD and rate-limits message sending', async () => {
    const get = vi.fn();
    const post = vi.fn();
    const patch = vi.fn();
    const remove = vi.fn();
    const app = { get, post, patch, delete: remove } as unknown as FastifyInstance;

    await registerOctoRoutes(app);

    const routes = new Map([
      ...get.mock.calls.map((call) => [call[0] as string, call[1] as Record<string, unknown>] as const),
      ...post.mock.calls.map((call) => [call[0] as string, call[1] as Record<string, unknown>] as const),
      ...patch.mock.calls.map((call) => [call[0] as string, call[1] as Record<string, unknown>] as const),
      ...remove.mock.calls.map((call) => [call[0] as string, call[1] as Record<string, unknown>] as const),
    ]);

    const conversationPaths = [
      '/octo/conversations',
      '/octo/conversations/:conversationId',
      '/octo/conversations/:conversationId/messages',
    ];
    for (const path of conversationPaths) {
      const route = routes.get(path);
      expect(route?.preHandler).toBeTypeOf('function');
    }
    expect(routes.get('/octo/conversations/:conversationId/messages')?.config).toEqual({
      rateLimit: { max: 30, timeWindow: '1 minute' },
    });
    expect(patch.mock.calls.map((call) => call[0])).toContain('/octo/conversations/:conversationId');
    expect(remove.mock.calls.map((call) => call[0])).toContain('/octo/conversations/:conversationId');
  });
});
