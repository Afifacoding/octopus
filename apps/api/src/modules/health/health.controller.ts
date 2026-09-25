import type { FastifyReply, FastifyRequest } from 'fastify';

import { getHealthStatus } from './health.service.js';

export async function healthController(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({
    success: true,
    data: getHealthStatus(),
  });
}
