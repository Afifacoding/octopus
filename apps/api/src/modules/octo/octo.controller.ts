/**
 * Octo Controller
 * HTTP request handlers for Octo endpoints
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../../core/errors/http-error.js';
import { OctoService } from './octo.service.js';
import { octoGraphQuerySchema, octoPatchParamsSchema, octoRequestSchema } from './octo.schemas.js';
import type { OctoRequestPayload } from './octo.schemas.js';

export function createOctoController(octoService: OctoService) {
  return {
    async summary(request: FastifyRequest, reply: FastifyReply) {
      const userId = request.auth?.userId;
      if (!userId) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const { projectId } = request.query as { projectId?: string };

      try {
        const summary = await octoService.getSummary(userId, projectId);

        return reply.code(200).send({
          success: true,
          data: summary,
        });
      } catch (error) {
        const httpError =
          error instanceof HttpError ? error : new HttpError(500, 'INTERNAL_ERROR', 'An error occurred');
        return reply.code(httpError.statusCode).send({
          success: false,
          error: {
            code: httpError.code,
            message: httpError.message,
          },
        });
      }
    },

    async ask(request: FastifyRequest, reply: FastifyReply) {
      const userId = request.auth?.userId;
      if (!userId) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      try {
        // Validate input
        const parseResult = octoRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          const errorMessage = parseResult.error.issues[0]?.message || 'Invalid request';
          throw new HttpError(400, 'INVALID_REQUEST', errorMessage);
        }

        const payload = parseResult.data as OctoRequestPayload;

        // Execute Octo ask
        const response = await octoService.ask({
          question: payload.question,
          pageContext: payload.pageContext,
          ...(payload.history ? { history: payload.history } : {}),
          ...(payload.mode ? { mode: payload.mode } : {}),
          ...(payload.images ? { images: payload.images } : {}),
          projectId: payload.projectId,
          snapshotId: payload.snapshotId,
          userId,
        });

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const httpError =
          error instanceof HttpError ? error : new HttpError(500, 'INTERNAL_ERROR', 'An error occurred');
        return reply.code(httpError.statusCode).send({
          success: false,
          error: {
            code: httpError.code,
            message: httpError.message,
          },
        });
      }
    },

    async graph(request: FastifyRequest, reply: FastifyReply) {
      const userId = request.auth?.userId;
      if (!userId) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');

      const query = octoGraphQuerySchema.parse(request.query);
      const graph = await octoService.getProjectGraph(userId, query.projectId, query.snapshotId);
      return reply.code(200).send({ success: true, data: graph });
    },

    async approvePatch(request: FastifyRequest, reply: FastifyReply) {
      const userId = request.auth?.userId;
      if (!userId) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');

      const { patchId } = octoPatchParamsSchema.parse(request.params);
      const snapshot = await octoService.approvePatch(userId, patchId);
      return reply.code(201).send({ success: true, data: { snapshot } });
    },

    async rejectPatch(request: FastifyRequest, reply: FastifyReply) {
      const userId = request.auth?.userId;
      if (!userId) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');

      const { patchId } = octoPatchParamsSchema.parse(request.params);
      const result = octoService.rejectPatch(userId, patchId);
      return reply.code(200).send({ success: true, data: result });
    },
  };
}

export type OctoController = ReturnType<typeof createOctoController>;
