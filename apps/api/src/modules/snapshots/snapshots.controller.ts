import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import {
  createSnapshotSchema,
  projectSnapshotParamsSchema,
  snapshotFileContentQuerySchema,
  snapshotIdParamsSchema,
} from './snapshots.schemas.js';
import type { SnapshotsService } from './snapshots.service.js';

export function createSnapshotsController(service: SnapshotsService) {
  return {
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSnapshotParamsSchema.parse(request.params);
      const payload = createSnapshotSchema.parse(request.body);

      const createInput = {
        captureSource: payload.captureSource,
        archive: payload.archive,
        ...(payload.clientName !== undefined ? { clientName: payload.clientName } : {}),
        ...(payload.clientVersion !== undefined ? { clientVersion: payload.clientVersion } : {}),
        ...(payload.fileCount !== undefined ? { fileCount: payload.fileCount } : {}),
        ...(payload.directoryCount !== undefined ? { directoryCount: payload.directoryCount } : {}),
        ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
        ...(payload.entries !== undefined ? { entries: payload.entries } : {}),
      };

      const snapshot = await service.createSnapshot(request.auth.userId, params.projectId, createInput);

      return reply.status(201).send({
        success: true,
        data: {
          snapshot,
        },
      });
    },

    list: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSnapshotParamsSchema.parse(request.params);
      const snapshots = await service.listSnapshots(request.auth.userId, params.projectId);

      return reply.status(200).send({
        success: true,
        data: {
          snapshots,
        },
      });
    },

    getById: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const snapshot = await service.getSnapshot(request.auth.userId, params.projectId, params.snapshotId);

      return reply.status(200).send({
        success: true,
        data: {
          snapshot,
        },
      });
    },

    getDirectoryTree: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const directoryTree = await service.getSnapshotDirectoryTree(
        request.auth.userId,
        params.projectId,
        params.snapshotId,
      );

      return reply.status(200).send({
        success: true,
        data: directoryTree,
      });
    },

    getFileContent: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const query = snapshotFileContentQuerySchema.parse(request.query);

      const fileContent = await service.getSnapshotFileContent(
        request.auth.userId,
        params.projectId,
        params.snapshotId,
        query.path,
      );

      return reply.status(200).send({
        success: true,
        data: fileContent,
      });
    },

    createBlueprint: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const blueprint = await service.createSnapshotBlueprint(request.auth.userId, params.projectId, params.snapshotId);

      return reply.status(201).send({
        success: true,
        data: blueprint,
      });
    },

    getBlueprint: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const blueprint = await service.getSnapshotBlueprint(request.auth.userId, params.projectId, params.snapshotId);

      return reply.status(200).send({
        success: true,
        data: blueprint,
      });
    },

    processBlueprint: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const blueprint = await service.processSnapshotBlueprint(request.auth.userId, params.projectId, params.snapshotId);

      return reply.status(200).send({
        success: true,
        data: blueprint,
      });
    },

    deleteBlueprint: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const blueprint = await service.deleteSnapshotBlueprint(request.auth.userId, params.projectId, params.snapshotId);

      return reply.status(200).send({
        success: true,
        data: blueprint,
      });
    },

    deleteById: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);
      const snapshot = await service.deleteSnapshot(request.auth.userId, params.projectId, params.snapshotId);

      return reply.status(200).send({
        success: true,
        message: 'Snapshot deleted successfully',
        data: {
          snapshot,
        },
      });
    },

    downloadZip: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotIdParamsSchema.parse(request.params);

      const result = await service.downloadSnapshotAsZip(request.auth.userId, params.projectId, params.snapshotId);

      return reply
        .status(200)
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${result.fileName}"`)
        .header('Content-Length', String(result.buffer.byteLength))
        .header('Cache-Control', 'no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .send(result.buffer);
    },
  };
}
