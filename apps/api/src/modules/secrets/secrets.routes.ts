import type { FastifyInstance } from 'fastify';

import { createRequireAuth } from '../auth/auth.middleware.js';
import { AuthMailer } from '../auth/auth.mailer.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { AuthService } from '../auth/auth.service.js';
import { createSecretsController } from './secrets.controller.js';
import { SecretsRepository } from './secrets.repository.js';
import { SecretsService } from './secrets.service.js';
import { createRequireVaultAccess } from './secrets.vault.middleware.js';

export async function registerSecretRoutes(app: FastifyInstance) {
  const authRepository = new AuthRepository();
  const authMailer = new AuthMailer();
  const authService = new AuthService(authRepository, authMailer);
  const requireAuth = createRequireAuth(authService);
  const requireVaultAccess = createRequireVaultAccess();

  const repository = new SecretsRepository();
  const service = new SecretsService(repository);
  const controller = createSecretsController(service, authService);

  app.get('/projects/:projectId/secrets/vault/session', { preHandler: requireAuth }, controller.vaultSession);
  app.post('/projects/:projectId/secrets/vault/unlock', { preHandler: requireAuth }, controller.unlockVault);
  app.post('/projects/:projectId/secrets/vault/lock', { preHandler: requireAuth }, controller.lockVault);

  app.get('/projects/:projectId/secrets', { preHandler: [requireAuth, requireVaultAccess] }, controller.list);
  app.post('/projects/:projectId/secrets', { preHandler: [requireAuth, requireVaultAccess] }, controller.create);
  app.get('/projects/:projectId/secrets/:secretId', { preHandler: [requireAuth, requireVaultAccess] }, controller.getById);
  app.post('/projects/:projectId/secrets/:secretId/reveal', { preHandler: [requireAuth, requireVaultAccess] }, controller.reveal);
  app.post('/projects/:projectId/secrets/:secretId/copy', { preHandler: [requireAuth, requireVaultAccess] }, controller.copy);
  app.post('/projects/:projectId/secrets/:secretId/hide', { preHandler: [requireAuth, requireVaultAccess] }, controller.hide);
  app.patch('/projects/:projectId/secrets/:secretId', { preHandler: [requireAuth, requireVaultAccess] }, controller.update);
  app.delete('/projects/:projectId/secrets/:secretId', { preHandler: [requireAuth, requireVaultAccess] }, controller.deleteById);

  app.post(
    '/projects/:projectId/snapshots/:snapshotId/secret-detections/process',
    { preHandler: requireAuth },
    controller.detectForSnapshot,
  );
  app.get(
    '/projects/:projectId/snapshots/:snapshotId/secret-detections',
    { preHandler: requireAuth },
    controller.listSnapshotDetections,
  );
  app.patch(
    '/projects/:projectId/snapshots/:snapshotId/secret-detections/:detectionId',
    { preHandler: requireAuth },
    controller.updateDetectionStatus,
  );
}
