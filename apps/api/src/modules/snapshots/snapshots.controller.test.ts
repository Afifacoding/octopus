import { describe, expect, it } from 'vitest';

import { createSnapshotsController } from './snapshots.controller.js';

describe('Snapshots controller', () => {
  it('uses authenticated ownership context for snapshot creation', async () => {
    const calls: Array<{ ownerId: string; projectId: string }> = [];

    const controller = createSnapshotsController({
      createSnapshot: async (ownerId: string, projectId: string) => {
        calls.push({ ownerId, projectId });
        return {
          id: 'snapshot_1',
          projectId,
          status: 'COMPLETED',
          captureSource: 'API',
          clientName: null,
          clientVersion: null,
          archiveStorageKey: 'user_1/project_1/snapshot_1/project.zip',
          archiveContentType: 'application/zip',
          archiveSizeBytes: 10,
          fileCount: 1,
          directoryCount: 1,
          integrityAlgorithm: 'sha256',
          integrityHash: 'abc',
          failureCode: null,
          failureReason: null,
          captureMetadata: null,
          processedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
    } as never);

    await controller.create(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
        },
        body: {
          captureSource: 'API',
          archive: {
            fileName: 'archive.zip',
            contentType: 'application/zip',
            base64Data: 'YQ==',
            sizeBytes: 1,
          },
        },
      } as never,
      {
        status: () => ({ send: () => undefined }),
      } as never,
    );

    expect(calls[0]).toEqual({ ownerId: 'user_1', projectId: 'project_1' });
  });

  it('rejects unauthenticated snapshot create requests', async () => {
    const controller = createSnapshotsController({
      createSnapshot: async () => ({ id: 'snapshot_1' }),
    } as never);

    await expect(
      controller.create(
        {
          params: { projectId: 'project_1' },
          body: {
            captureSource: 'API',
            archive: {
              fileName: 'archive.zip',
              contentType: 'application/zip',
              base64Data: 'YQ==',
              sizeBytes: 1,
            },
          },
        } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('uses authenticated ownership context for directory tree retrieval', async () => {
    const calls: Array<{ ownerId: string; projectId: string; snapshotId: string }> = [];

    const controller = createSnapshotsController({
      getSnapshotDirectoryTree: async (ownerId: string, projectId: string, snapshotId: string) => {
        calls.push({ ownerId, projectId, snapshotId });
        return {
          snapshotId,
          status: 'COMPLETED',
          failureCode: null,
          failureReason: null,
          directoryTree: {
            generatedAt: new Date().toISOString(),
            totalEntries: 1,
            totalFiles: 1,
            totalDirectories: 0,
            totalSizeBytes: 10,
            nodes: [],
          },
        };
      },
    } as never);

    await controller.getDirectoryTree(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
          snapshotId: 'snapshot_1',
        },
      } as never,
      {
        status: () => ({ send: () => undefined }),
      } as never,
    );

    expect(calls[0]).toEqual({ ownerId: 'user_1', projectId: 'project_1', snapshotId: 'snapshot_1' });
  });

  it('uses authenticated ownership context for file-content retrieval', async () => {
    const calls: Array<{ ownerId: string; projectId: string; snapshotId: string; filePath: string }> = [];

    const controller = createSnapshotsController({
      getSnapshotFileContent: async (ownerId: string, projectId: string, snapshotId: string, filePath: string) => {
        calls.push({ ownerId, projectId, snapshotId, filePath });
        return {
          snapshotId,
          status: 'COMPLETED',
          failureCode: null,
          failureReason: null,
          file: {
            path: filePath,
            fileName: 'index.ts',
            sizeBytes: 12,
            contentTypeGuess: 'application/typescript',
            isText: true,
            supported: true,
            unsupportedReason: null,
            redactionApplied: false,
            truncated: false,
            content: 'export const v = 1;',
          },
        };
      },
    } as never);

    await controller.getFileContent(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
          snapshotId: 'snapshot_1',
        },
        query: {
          path: 'project/src/index.ts',
        },
      } as never,
      {
        status: () => ({ send: () => undefined }),
      } as never,
    );

    expect(calls[0]).toEqual({
      ownerId: 'user_1',
      projectId: 'project_1',
      snapshotId: 'snapshot_1',
      filePath: 'project/src/index.ts',
    });
  });

  it('uses authenticated ownership context for blueprint processing', async () => {
    const calls: Array<{ ownerId: string; projectId: string; snapshotId: string }> = [];

    const controller = createSnapshotsController({
      processSnapshotBlueprint: async (ownerId: string, projectId: string, snapshotId: string) => {
        calls.push({ ownerId, projectId, snapshotId });
        return {
          snapshotId,
          snapshotStatus: 'COMPLETED',
          blueprint: {
            id: 'blueprint_1',
            snapshotId,
            status: 'COMPLETED',
            projectType: 'FULLSTACK',
            detectedFrameworks: ['React'],
            detectedLanguages: ['TypeScript'],
            importantConfigFiles: ['package.json'],
            dependencyMetadata: null,
            entryPoints: ['src/main.tsx'],
            detectedCommands: ['npm run dev'],
            environmentReferences: [],
            summary: 'ok',
            failureCode: null,
            failureReason: null,
            processedAt: new Date().toISOString(),
            metadata: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      },
    } as never);

    await controller.processBlueprint(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
          snapshotId: 'snapshot_1',
        },
      } as never,
      {
        status: () => ({ send: () => undefined }),
      } as never,
    );

    expect(calls[0]).toEqual({ ownerId: 'user_1', projectId: 'project_1', snapshotId: 'snapshot_1' });
  });

  it('uses authenticated ownership context for blueprint deletion', async () => {
    const calls: Array<{ ownerId: string; projectId: string; snapshotId: string }> = [];

    const controller = createSnapshotsController({
      deleteSnapshotBlueprint: async (ownerId: string, projectId: string, snapshotId: string) => {
        calls.push({ ownerId, projectId, snapshotId });
        return {
          snapshotId,
          snapshotStatus: 'COMPLETED',
          blueprint: {
            id: 'blueprint_1',
            snapshotId,
            status: 'COMPLETED',
            projectType: 'FULLSTACK',
            detectedFrameworks: [],
            detectedLanguages: [],
            importantConfigFiles: [],
            dependencyMetadata: null,
            entryPoints: [],
            detectedCommands: [],
            environmentReferences: [],
            summary: null,
            failureCode: null,
            failureReason: null,
            processedAt: null,
            metadata: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      },
    } as never);

    await controller.deleteBlueprint(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
          snapshotId: 'snapshot_1',
        },
      } as never,
      {
        status: () => ({ send: () => undefined }),
      } as never,
    );

    expect(calls[0]).toEqual({ ownerId: 'user_1', projectId: 'project_1', snapshotId: 'snapshot_1' });
  });

  it('returns success message for snapshot delete', async () => {
    let payload: unknown = null;

    const controller = createSnapshotsController({
      deleteSnapshot: async () => ({
        id: 'snapshot_1',
        projectId: 'project_1',
        status: 'COMPLETED',
        captureSource: 'API',
        clientName: null,
        clientVersion: null,
        archiveStorageKey: 'user_1/project_1/snapshot_1/project.zip',
        archiveContentType: 'application/zip',
        archiveSizeBytes: 1,
        fileCount: 1,
        directoryCount: 0,
        integrityAlgorithm: 'sha256',
        integrityHash: 'abc',
        failureCode: null,
        failureReason: null,
        captureMetadata: null,
        processedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    } as never);

    await controller.deleteById(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
          snapshotId: 'snapshot_1',
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
      message: 'Snapshot deleted successfully',
      data: {
        snapshot: {
          id: 'snapshot_1',
        },
      },
    });
  });

  it('rejects unauthenticated snapshot download requests', async () => {
    const controller = createSnapshotsController({
      downloadSnapshotAsZip: async () => ({
        buffer: Buffer.from('zip'),
        contentType: 'application/zip',
        fileName: 'project_snapshot_snapshot_1.zip',
        sanitizedFileCount: 0,
        totalFileCount: 0,
      }),
    } as never);

    await expect(
      controller.downloadZip(
        {
          params: { projectId: 'project_1', snapshotId: 'snapshot_1' },
        } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('uses authenticated ownership context and sets zip download headers', async () => {
    const calls: Array<{ ownerId: string; projectId: string; snapshotId: string }> = [];
    const headers: Record<string, string> = {};
    let sentBuffer: Buffer | null = null;
    let statusCode: number | null = null;

    const zipBuffer = Buffer.from('PK\u0003\u0004fake-zip-content');

    const controller = createSnapshotsController({
      downloadSnapshotAsZip: async (ownerId: string, projectId: string, snapshotId: string) => {
        calls.push({ ownerId, projectId, snapshotId });
        return {
          buffer: zipBuffer,
          contentType: 'application/zip',
          fileName: 'octopus-web_snapshot_snapshot_1.zip',
          sanitizedFileCount: 1,
          totalFileCount: 4,
        };
      },
    } as never);

    const reply = {
      status: (code: number) => {
        statusCode = code;
        return reply;
      },
      header: (key: string, value: string) => {
        headers[key] = value;
        return reply;
      },
      send: (payload: Buffer) => {
        sentBuffer = payload;
        return reply;
      },
    };

    await controller.downloadZip(
      {
        auth: {
          userId: 'user_1',
          sessionId: 'session_1',
        },
        params: {
          projectId: 'project_1',
          snapshotId: 'snapshot_1',
        },
      } as never,
      reply as never,
    );

    expect(calls[0]).toEqual({ ownerId: 'user_1', projectId: 'project_1', snapshotId: 'snapshot_1' });
    expect(statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('application/zip');
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="octopus-web_snapshot_snapshot_1.zip"',
    );
    expect(headers['Content-Length']).toBe(String(zipBuffer.byteLength));
    expect(sentBuffer).toBe(zipBuffer);
  });
});
