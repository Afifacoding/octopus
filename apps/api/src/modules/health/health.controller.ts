import type { FastifyReply } from 'fastify';

import { getHealthStatus } from './health.service.js';
import type { DatabaseHealthCheck } from './health.service.js';

type HealthReply = {
  status(code: number): HealthReply;
  send(payload: unknown): unknown;
};

export function createHealthController(checkDatabase?: DatabaseHealthCheck) {
  return async (_request: unknown, reply: HealthReply | FastifyReply) => {
    const status = await getHealthStatus(checkDatabase);
    return reply.status(status.status === 'ok' ? 200 : 503).send({
      success: status.status === 'ok',
      data: status,
    });
  };
}

export const healthController = createHealthController();
