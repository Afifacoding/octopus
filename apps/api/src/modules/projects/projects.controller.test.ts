import { describe, expect, it } from 'vitest';

import { createProjectsController } from './projects.controller.js';

describe('Projects controller', () => {
  it('uses authenticated user context instead of client-provided ownerId on create', async () => {
    const calls: Array<{ ownerId: string; payload: unknown }> = [];

    const controller = createProjectsController({
      createProject: async (ownerId: string, payload: unknown) => {
        calls.push({ ownerId, payload });
        return {
          id: 'project_1',
          ownerId,
          name: 'Safe Project',
          description: null,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archivedAt: null,
        };
      },
    } as never);

    const request = {
      auth: {
        userId: 'user_session',
      },
      body: {
        ownerId: 'malicious_user',
        name: 'Safe Project',
      },
    };

    const payloads: unknown[] = [];

    const reply = {
      status: (_code: number) => ({
        send: (payload: unknown) => {
          payloads.push(payload);
          return payload;
        },
      }),
    };

    await controller.create(request as never, reply as never);

    expect(calls[0]?.ownerId).toBe('user_session');
    expect(payloads.length).toBe(1);
  });

  it('rejects project creation without auth context', async () => {
    const controller = createProjectsController({
      createProject: async () => ({
        id: 'project_1',
        ownerId: 'user_1',
        name: 'Project',
        description: null,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archivedAt: null,
      }),
    } as never);

    await expect(
      controller.create(
        {
          body: {
            name: 'Project',
          },
        } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('uses authenticated user context for permanent project delete', async () => {
    const calls: Array<{ ownerId: string; projectId: string }> = [];

    const controller = createProjectsController({
      deleteProject: async (ownerId: string, projectId: string) => {
        calls.push({ ownerId, projectId });
        return {
          projectId,
          deleted: true,
        };
      },
    } as never);

    await controller.deletePermanent(
      {
        auth: {
          userId: 'user_session',
        },
        params: {
          id: 'project_123',
        },
      } as never,
      {
        status: () => ({
          send: () => undefined,
        }),
      } as never,
    );

    expect(calls[0]).toEqual({ ownerId: 'user_session', projectId: 'project_123' });
  });

  it('returns success message for permanent project delete', async () => {
    let payload: unknown = null;

    const controller = createProjectsController({
      deleteProject: async (_ownerId: string, projectId: string) => ({
        projectId,
        deleted: true,
      }),
    } as never);

    await controller.deletePermanent(
      {
        auth: {
          userId: 'user_session',
        },
        params: {
          id: 'project_123',
        },
      } as never,
      {
        status: () => ({
          send: (nextPayload: unknown) => {
            payload = nextPayload;
          },
        }),
      } as never,
    );

    expect(payload).toMatchObject({
      success: true,
      message: 'Project deleted successfully',
      data: {
        projectId: 'project_123',
        deleted: true,
      },
    });
  });
});
