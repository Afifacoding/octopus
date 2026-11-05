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
});
