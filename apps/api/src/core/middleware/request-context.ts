import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requestContextHook(request: FastifyRequest, _reply: FastifyReply) {
  request.log = request.log.child({ requestId: request.id });
}
