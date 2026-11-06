import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import { createOctoConversationSchema, getOctoConversationQuerySchema, listOctoConversationsSchema, octoConversationParamsSchema, renameOctoConversationSchema, sendOctoConversationMessageSchema } from './octo.conversations.schemas.js';
import { OctoConversationsService } from './octo.conversations.service.js';

export function createOctoConversationsController(service: OctoConversationsService) {
  function userId(request: FastifyRequest) {
    const id = request.auth?.userId;
    if (!id) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
    return id;
  }

  return {
    async create(request: FastifyRequest, reply: FastifyReply) {
      const input = createOctoConversationSchema.parse(request.body);
      const conversation = await service.createConversation(userId(request), input);
      return reply.code(201).send({ success: true, data: conversation });
    },

    async list(request: FastifyRequest, reply: FastifyReply) {
      const query = listOctoConversationsSchema.parse(request.query);
      const result = await service.listConversations(userId(request), query);
      return reply.code(200).send({ success: true, data: result });
    },

    async get(request: FastifyRequest, reply: FastifyReply) {
      const { conversationId } = octoConversationParamsSchema.parse(request.params);
      const { messageLimit, beforeMessageId } = getOctoConversationQuerySchema.parse(request.query);
      const result = await service.getConversation(userId(request), conversationId, messageLimit, beforeMessageId);
      return reply.code(200).send({ success: true, data: result });
    },

    async rename(request: FastifyRequest, reply: FastifyReply) {
      const { conversationId } = octoConversationParamsSchema.parse(request.params);
      const { title } = renameOctoConversationSchema.parse(request.body);
      const result = await service.renameConversation(userId(request), conversationId, title);
      return reply.code(200).send({ success: true, data: result });
    },

    async remove(request: FastifyRequest, reply: FastifyReply) {
      const { conversationId } = octoConversationParamsSchema.parse(request.params);
      const result = await service.deleteConversation(userId(request), conversationId);
      return reply.code(200).send({ success: true, data: result });
    },

    async sendMessage(request: FastifyRequest, reply: FastifyReply) {
      const { conversationId } = octoConversationParamsSchema.parse(request.params);
      const input = sendOctoConversationMessageSchema.parse(request.body);
      const result = await service.sendMessage(userId(request), conversationId, input);
      return reply.code(201).send({ success: true, data: result });
    },
  };
}
