import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import type { AuthService } from './auth.service.js';
import { SESSION_COOKIE_NAME } from './auth.cookies.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      sessionId: string;
    };
  }
}

export function createRequireAuth(service: AuthService) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
    const token = request.cookies[SESSION_COOKIE_NAME];

    if (!token) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
    }

    const sessionInfo = await service.getCurrentUserBySessionToken(token);

    request.auth = {
      userId: sessionInfo.user.id,
      sessionId: sessionInfo.sessionId,
    };
  };
}
