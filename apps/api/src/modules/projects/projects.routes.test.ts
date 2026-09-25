import { describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';

async function createAuthenticatedContext() {
  const app = buildApp();
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `project_color_${unique}@gmail.com`;
  const password = 'DeleteProject123A';
  const username = `projectcolor${unique}`;

  const signup = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: {
      username,
      email,
      password,
      confirmPassword: password,
    },
  });

  expect(signup.statusCode).toBe(201);
  const signupPayload = signup.json() as {
    success: true;
    data: {
      developmentOtp?: string;
    };
  };

  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-otp',
    payload: {
      email,
      otp: signupPayload.data.developmentOtp,
    },
  });

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      emailOrUsername: email,
      password,
    },
  });

  expect(login.statusCode).toBe(200);
  const sessionCookie = login.headers['set-cookie'];
  expect(sessionCookie).toBeDefined();

  return {
    app,
    cookie: sessionCookie as string,
    unique,
  };
}

describe('Project permanent delete route', () => {
  it('creates project with a valid preset color', async () => {
    const context = await createAuthenticatedContext();

    try {
      const created = await context.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: {
          cookie: context.cookie,
        },
        payload: {
          name: `Color Project ${context.unique}`,
          color: 'TEAL',
        },
      });

      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        success: true,
        data: {
          project: {
            color: 'TEAL',
          },
        },
      });

      const listed = await context.app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: {
          cookie: context.cookie,
        },
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({
        success: true,
        data: {
          projects: expect.arrayContaining([
            expect.objectContaining({
              color: 'TEAL',
            }),
          ]),
        },
      });
    } finally {
      await context.app.close();
    }
  });

  it('creates project without color and keeps backward compatibility', async () => {
    const context = await createAuthenticatedContext();

    try {
      const created = await context.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: {
          cookie: context.cookie,
        },
        payload: {
          name: `Legacy Project ${context.unique}`,
        },
      });

      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        success: true,
        data: {
          project: {
            color: null,
          },
        },
      });
    } finally {
      await context.app.close();
    }
  });

  it('updates project color and can clear it', async () => {
    const context = await createAuthenticatedContext();

    try {
      const created = await context.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: {
          cookie: context.cookie,
        },
        payload: {
          name: `Update Color ${context.unique}`,
        },
      });

      const projectId = (created.json() as { success: true; data: { project: { id: string } } }).data.project.id;

      const updated = await context.app.inject({
        method: 'PATCH',
        url: `/api/v1/projects/${projectId}`,
        headers: {
          cookie: context.cookie,
        },
        payload: {
          color: 'ORANGE',
        },
      });

      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        success: true,
        data: {
          project: {
            color: 'ORANGE',
          },
        },
      });

      const cleared = await context.app.inject({
        method: 'PATCH',
        url: `/api/v1/projects/${projectId}`,
        headers: {
          cookie: context.cookie,
        },
        payload: {
          color: null,
        },
      });

      expect(cleared.statusCode).toBe(200);
      expect(cleared.json()).toMatchObject({
        success: true,
        data: {
          project: {
            color: null,
          },
        },
      });
    } finally {
      await context.app.close();
    }
  });

  it('rejects invalid project color', async () => {
    const context = await createAuthenticatedContext();

    try {
      const created = await context.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: {
          cookie: context.cookie,
        },
        payload: {
          name: `Invalid Color ${context.unique}`,
          color: 'MAGENTA',
        },
      });

      expect(created.statusCode).toBe(400);
      expect(created.json()).toMatchObject({
        success: false,
      });
    } finally {
      await context.app.close();
    }
  });

  it('blocks direct API delete when snapshots remain', async () => {
    const context = await createAuthenticatedContext();

    try {
      const project = await context.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: {
          cookie: context.cookie,
        },
        payload: {
          name: `Delete Rule ${context.unique}`,
        },
      });

      expect(project.statusCode).toBe(201);
      const projectId = (project.json() as { success: true; data: { project: { id: string } } }).data.project.id;

      const snapshot = await context.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/snapshots`,
        headers: {
          cookie: context.cookie,
        },
        payload: {
          captureSource: 'API',
          archive: {
            fileName: 'project.zip',
            contentType: 'application/zip',
            base64Data: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
            sizeBytes: 22,
          },
        },
      });

      expect(snapshot.statusCode).toBe(201);

      const blockedDelete = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${projectId}/permanent`,
        headers: {
          cookie: context.cookie,
        },
      });

      expect(blockedDelete.statusCode).toBe(409);
      expect(blockedDelete.json()).toMatchObject({
        success: false,
        error: {
          code: 'PROJECT_HAS_SNAPSHOTS',
          message: 'Delete all snapshots before deleting this project.',
        },
      });
    } finally {
      await context.app.close();
    }
  });
});