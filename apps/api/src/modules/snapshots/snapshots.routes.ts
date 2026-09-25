import type { FastifyInstance } from 'fastify';

import { createRequireAuth } from '../auth/auth.middleware.js';
import { AuthMailer } from '../auth/auth.mailer.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { AuthService } from '../auth/auth.service.js';
import { SecretsRepository } from '../secrets/secrets.repository.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { createSnapshotsController } from './snapshots.controller.js';
import { SnapshotsRepository } from './snapshots.repository.js';
import { SnapshotsService } from './snapshots.service.js';
import { createSnapshotStorage } from './snapshots.storage.js';

export async function registerSnapshotRoutes(app: FastifyInstance) {
  const authRepository = new AuthRepository();
  const authMailer = new AuthMailer();
  const authService = new AuthService(authRepository, authMailer);
  const requireAuth = createRequireAuth(authService);

  const snapshotsRepository = new SnapshotsRepository();
  const snapshotsStorage = createSnapshotStorage();
  const secretsRepository = new SecretsRepository();
  const secretsService = new SecretsService(secretsRepository, snapshotsStorage);
  const snapshotsService = new SnapshotsService(snapshotsRepository, snapshotsStorage, secretsService);
  const controller = createSnapshotsController(snapshotsService);

  app.post('/projects/:projectId/snapshots', { preHandler: requireAuth }, controller.create);
  app.get('/projects/:projectId/snapshots', { preHandler: requireAuth }, controller.list);
  app.get('/projects/:projectId/snapshots/:snapshotId', { preHandler: requireAuth }, controller.getById);
  app.get(
    '/projects/:projectId/snapshots/:snapshotId/directory-tree',
    { preHandler: requireAuth },
    controller.getDirectoryTree,
  );
  app.get('/projects/:projectId/snapshots/:snapshotId/file-content', { preHandler: requireAuth }, controller.getFileContent);
  app.post('/projects/:projectId/snapshots/:snapshotId/blueprint', { preHandler: requireAuth }, controller.createBlueprint);
  app.get('/projects/:projectId/snapshots/:snapshotId/blueprint', { preHandler: requireAuth }, controller.getBlueprint);
  app.post(
    '/projects/:projectId/snapshots/:snapshotId/blueprint/process',
    { preHandler: requireAuth },
    controller.processBlueprint,
  );
  app.delete('/projects/:projectId/snapshots/:snapshotId/blueprint', { preHandler: requireAuth }, controller.deleteBlueprint);
  app.get('/projects/:projectId/snapshots/:snapshotId/download', { preHandler: requireAuth }, controller.downloadZip);
  app.delete('/projects/:projectId/snapshots/:snapshotId', { preHandler: requireAuth }, controller.deleteById);
}
