import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectIdParamsSchema,
  updateProjectSchema,
} from './projects.schemas.js';
import type { ProjectsService } from './projects.service.js';

export function createProjectsController(service: ProjectsService) {
  return {
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const payload = createProjectSchema.parse(request.body);
      const createInput = {
        name: payload.name,
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.color !== undefined ? { color: payload.color } : {}),
      };
      const project = await service.createProject(request.auth.userId, createInput);

      return reply.status(201).send({
        success: true,
        data: {
          project,
        },
      });
    },

    list: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const query = listProjectsQuerySchema.parse(request.query);
      const listInput = {
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.q !== undefined ? { q: query.q } : {}),
      };
      const projects = await service.listProjects(request.auth.userId, listInput);

      return reply.status(200).send({
        success: true,
        data: {
          projects,
        },
      });
    },

    getById: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const project = await service.getProject(request.auth.userId, params.id);

      return reply.status(200).send({
        success: true,
        data: {
          project,
        },
      });
    },

    update: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const payload = updateProjectSchema.parse(request.body);
      const updateInput = {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.color !== undefined ? { color: payload.color } : {}),
      };
      const project = await service.updateProject(request.auth.userId, params.id, updateInput);

      return reply.status(200).send({
        success: true,
        data: {
          project,
        },
      });
    },

    archive: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const project = await service.archiveProject(request.auth.userId, params.id);

      return reply.status(200).send({
        success: true,
        data: {
          project,
        },
      });
    },

    deletePermanent: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const result = await service.deleteProject(request.auth.userId, params.id);

      return reply.status(200).send({
        success: true,
        message: 'Project deleted successfully',
        data: result,
      });
    },
  };
}
