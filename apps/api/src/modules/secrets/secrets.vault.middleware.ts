import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import { readVaultSessionToken, VAULT_SESSION_COOKIE_NAME } from './secrets.vault-session.js';

export function createRequireVaultAccess() {
  return async function requireVaultAccess(request: FastifyRequest, _reply: FastifyReply) {
    if (!request.auth) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
    }

    const token = request.cookies[VAULT_SESSION_COOKIE_NAME];
    if (!token) {
      throw new HttpError(403, 'VAULT_ACCESS_REQUIRED', 'Secret Vault is locked');
    }

    const session = readVaultSessionToken(token);
    if (!session) {
      throw new HttpError(403, 'VAULT_ACCESS_REQUIRED', 'Secret Vault access expired');
    }

    const params = (request.params ?? {}) as { projectId?: unknown };
    const projectId = typeof params.projectId === 'string' ? params.projectId : null;

    if (!projectId || session.projectId !== projectId || session.userId !== request.auth.userId) {
      throw new HttpError(403, 'VAULT_ACCESS_REQUIRED', 'Secret Vault access is invalid for this project');
    }
  };
}
