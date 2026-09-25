import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import {
  createSecretSchema,
  detectionIdParamsSchema,
  markDetectionSchema,
  projectIdParamsSchema,
  projectSecretIdParamsSchema,
  snapshotDetectionParamsSchema,
  updateSecretSchema,
  vaultUnlockSchema,
} from './secrets.schemas.js';
import {
  clearVaultSessionCookie,
  createVaultSessionToken,
  readVaultSessionToken,
  setVaultSessionCookie,
  VAULT_SESSION_COOKIE_NAME,
} from './secrets.vault-session.js';
import type { SecretsService } from './secrets.service.js';
import type { AuthService } from '../auth/auth.service.js';

export function createSecretsController(service: SecretsService, authService: Pick<AuthService, 'verifyCurrentUserPassword'>) {
  return {
    vaultSession: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const token = request.cookies[VAULT_SESSION_COOKIE_NAME];
      const session = typeof token === 'string' ? readVaultSessionToken(token) : null;
      const unlocked = Boolean(
        session && session.userId === request.auth.userId && session.projectId === params.projectId,
      );

      return reply.status(200).send({
        success: true,
        data: {
          unlocked,
          expiresAt: unlocked ? new Date(session!.exp).toISOString() : null,
        },
      });
    },

    unlockVault: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const payload = vaultUnlockSchema.parse(request.body);

      await service.assertProjectAccess(request.auth.userId, params.projectId);

      const valid = await authService.verifyCurrentUserPassword(request.auth.userId, payload.password);
      if (!valid) {
        await service.auditVaultUnlockFailed(request.auth.userId, params.projectId);
        throw new HttpError(401, 'VAULT_UNLOCK_FAILED', 'Password verification failed');
      }

      const vaultSession = createVaultSessionToken({
        userId: request.auth.userId,
        projectId: params.projectId,
      });

      setVaultSessionCookie(reply, vaultSession.token, vaultSession.expiresAt);
      await service.auditVaultUnlocked(request.auth.userId, params.projectId);

      return reply.status(200).send({
        success: true,
        data: {
          unlocked: true,
          expiresAt: vaultSession.expiresAt.toISOString(),
        },
      });
    },

    lockVault: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      await service.assertProjectAccess(request.auth.userId, params.projectId);
      clearVaultSessionCookie(reply);
      await service.auditVaultLocked(request.auth.userId, params.projectId);

      return reply.status(200).send({
        success: true,
        data: {
          locked: true,
        },
      });
    },

    list: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const secrets = await service.listSecrets(request.auth.userId, params.projectId);

      return reply.status(200).send({
        success: true,
        data: {
          secrets,
        },
      });
    },

    create: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectIdParamsSchema.parse(request.params);
      const payload = createSecretSchema.parse(request.body);

      const secret = await service.createSecret(request.auth.userId, params.projectId, {
        label: payload.label,
        category: payload.category,
        confidence: payload.confidence,
        ...(payload.value !== undefined ? { value: payload.value } : {}),
        ...(payload.sourceSnapshotId !== undefined ? { sourceSnapshotId: payload.sourceSnapshotId } : {}),
        ...(payload.sourceDetectionId !== undefined ? { sourceDetectionId: payload.sourceDetectionId } : {}),
        ...(payload.sourceFilePath !== undefined ? { sourceFilePath: payload.sourceFilePath } : {}),
        ...(payload.sourceLineNumber !== undefined ? { sourceLineNumber: payload.sourceLineNumber } : {}),
        ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
      });

      return reply.status(201).send({
        success: true,
        data: {
          secret,
        },
      });
    },

    getById: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSecretIdParamsSchema.parse(request.params);
      const secret = await service.getSecret(request.auth.userId, params.projectId, params.secretId);

      return reply.status(200).send({
        success: true,
        data: {
          secret,
        },
      });
    },

    reveal: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSecretIdParamsSchema.parse(request.params);
      const reveal = await service.revealSecret(request.auth.userId, params.projectId, params.secretId);

      return reply.status(200).send({
        success: true,
        data: reveal,
      });
    },

    copy: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSecretIdParamsSchema.parse(request.params);
      const result = await service.auditSecretCopied(request.auth.userId, params.projectId, params.secretId);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },

    hide: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSecretIdParamsSchema.parse(request.params);
      const result = await service.auditSecretHidden(request.auth.userId, params.projectId, params.secretId);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },

    update: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSecretIdParamsSchema.parse(request.params);
      const payload = updateSecretSchema.parse(request.body);

      const secret = await service.updateSecret(request.auth.userId, params.projectId, params.secretId, {
        ...(payload.label !== undefined ? { label: payload.label } : {}),
        ...(payload.category !== undefined ? { category: payload.category } : {}),
        ...(payload.confidence !== undefined ? { confidence: payload.confidence } : {}),
        ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
      });

      return reply.status(200).send({
        success: true,
        data: {
          secret,
        },
      });
    },

    deleteById: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = projectSecretIdParamsSchema.parse(request.params);
      const result = await service.deleteSecret(request.auth.userId, params.projectId, params.secretId);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },

    detectForSnapshot: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotDetectionParamsSchema.parse(request.params);
      const result = await service.processSnapshotDetections(
        request.auth.userId,
        params.projectId,
        params.snapshotId,
      );

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },

    listSnapshotDetections: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = snapshotDetectionParamsSchema.parse(request.params);
      const result = await service.listSnapshotDetections(request.auth.userId, params.projectId, params.snapshotId);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },

    updateDetectionStatus: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const params = detectionIdParamsSchema.parse(request.params);
      const payload = markDetectionSchema.parse(request.body);

      const detection = await service.updateDetectionStatus(
        request.auth.userId,
        params.projectId,
        params.snapshotId,
        params.detectionId,
        payload.status,
      );

      return reply.status(200).send({
        success: true,
        data: {
          detection,
        },
      });
    },
  };
}
