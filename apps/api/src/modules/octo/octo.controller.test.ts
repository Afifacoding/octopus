import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { OctoService } from './octo.service.js';
import { createOctoController } from './octo.controller.js';

function request(input: { auth?: { userId: string }; query?: unknown }) {
  return input as FastifyRequest;
}

function reply() {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
  } as unknown as FastifyReply;
}

describe('OCTOBOT Graphify controller', () => {
  it('requires authentication before searching graph nodes', async () => {
    const service = { searchProjectGraph: vi.fn() };
    const controller = createOctoController(service as unknown as OctoService);

    await expect(controller.graphSearch(request({ query: {} }), reply())).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(service.searchProjectGraph).not.toHaveBeenCalled();
  });

  it('validates bounded search input and scopes it to the authenticated user', async () => {
    const result = { nodes: [], relationships: [], page: 1, pageSize: 20, total: 0, hasMore: false };
    const service = { searchProjectGraph: vi.fn().mockResolvedValue(result) };
    const controller = createOctoController(service as unknown as OctoService);
    const response = reply();

    await controller.graphSearch(request({
      auth: { userId: 'owner-1' },
      query: {
        projectId: 'cmabc123def4560000ghij789',
        snapshotId: 'cmxyz987wvu6540000tsrq321',
        query: 'AuthService',
      },
    }), response);

    expect(service.searchProjectGraph).toHaveBeenCalledWith(
      'owner-1',
      'cmabc123def4560000ghij789',
      'cmxyz987wvu6540000tsrq321',
      'AuthService',
      undefined,
      1,
      20,
    );
    expect(response.code).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({ success: true, data: result });
  });
});

describe('OCTOBOT recommendations controller', () => {
  it('requires authentication before reading project recommendations', async () => {
    const service = { getProjectRecommendations: vi.fn() };
    const controller = createOctoController(service as unknown as OctoService);

    await expect(controller.recommendations(request({ query: {} }), reply())).rejects.toMatchObject({
      statusCode: 401,
    });

    describe('OCTOBOT model catalog controller', () => {
      it('requires authentication and never exposes provider credentials', async () => {
        const catalog = {
          active: { provider: 'gemini', model: 'gemini-2.0-flash' },
          providers: [{ id: 'gemini', configured: true, models: [] }],
        };
        const service = { getModelCatalog: vi.fn().mockReturnValue(catalog) };
        const controller = createOctoController(service as unknown as OctoService);

        await expect(controller.models(request({}), reply())).rejects.toMatchObject({ statusCode: 401 });
        expect(service.getModelCatalog).not.toHaveBeenCalled();

        const response = reply();
        await controller.models(request({ auth: { userId: 'owner-1' } }), response);
        expect(service.getModelCatalog).toHaveBeenCalledOnce();
        expect(response.send).toHaveBeenCalledWith({ success: true, data: catalog });
      });
    });
    expect(service.getProjectRecommendations).not.toHaveBeenCalled();
  });

  it('validates project and snapshot IDs and scopes requests to the authenticated user', async () => {
    const data = { projectId: 'project', snapshotId: 'snapshot', recommendations: [] };
    const service = { getProjectRecommendations: vi.fn().mockResolvedValue(data) };
    const controller = createOctoController(service as unknown as OctoService);
    const response = reply();

    await controller.recommendations(request({
      auth: { userId: 'owner-1' },
      query: { projectId: 'project', snapshotId: 'snapshot' },
    }), response);

    expect(service.getProjectRecommendations).toHaveBeenCalledWith('owner-1', 'project', 'snapshot');
    expect(response.code).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({ success: true, data });

    await expect(controller.recommendations(request({
      auth: { userId: 'owner-1' },
      query: { projectId: '', snapshotId: 'snapshot' },
    }), reply())).rejects.toMatchObject({ name: 'ZodError' });
  });
});
