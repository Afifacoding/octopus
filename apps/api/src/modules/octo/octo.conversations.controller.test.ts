import { describe, expect, it, vi } from 'vitest';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import type { OctoConversationsService } from './octo.conversations.service.js';
import { createOctoConversationsController } from './octo.conversations.controller.js';

function request(input: {
  auth?: { userId: string };
  body?: unknown;
  params?: unknown;
  query?: unknown;
}) {
  return input as FastifyRequest;
}

function reply() {
  const result = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
  };
  return result as unknown as FastifyReply;
}

describe('OCTOBOT conversation controller', () => {
  it('requires authentication and validates create input before calling the service', async () => {
    const service = { createConversation: vi.fn() };
    const controller = createOctoConversationsController(service as unknown as OctoConversationsService);

    await expect(controller.create(request({ body: { conversationType: 'GENERAL' } }), reply()))
      .rejects.toMatchObject({ statusCode: 401 });
    await expect(controller.create(request({
      auth: { userId: 'owner-1' },
      body: { conversationType: 'PROJECT' },
    }), reply())).rejects.toBeInstanceOf(Error);
    expect(service.createConversation).not.toHaveBeenCalled();
  });

  it('uses the authenticated user and returns the created conversation', async () => {
    const conversation = { id: 'conv-1', title: 'New chat', conversationType: 'GENERAL' };
    const service = { createConversation: vi.fn().mockResolvedValue(conversation) };
    const controller = createOctoConversationsController(service as unknown as OctoConversationsService);
    const response = reply();

    await controller.create(request({
      auth: { userId: 'owner-1' },
      body: { conversationType: 'GENERAL' },
    }), response);

    expect(service.createConversation).toHaveBeenCalledWith('owner-1', { conversationType: 'GENERAL' });
    expect(response.code).toHaveBeenCalledWith(201);
    expect(response.send).toHaveBeenCalledWith({ success: true, data: conversation });
  });

  it('rejects unauthenticated deletion without revealing ownership', async () => {
    const service = { deleteConversation: vi.fn() };
    const controller = createOctoConversationsController(service as unknown as OctoConversationsService);
    await expect(controller.remove(request({ params: { conversationId: 'conv-1' } }), reply()))
      .rejects.toBeInstanceOf(HttpError);
    expect(service.deleteConversation).not.toHaveBeenCalled();
  });
});
