/**
 * Octo Routes
 * Route registration for Octo endpoints
 */

import type { FastifyInstance } from 'fastify';
import { ProjectsRepository } from '../projects/projects.repository.js';
import { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import { createOctoController } from './octo.controller.js';
import { OctoService } from './octo.service.js';
import { createRequireAuth } from '../auth/auth.middleware.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { AuthMailer } from '../auth/auth.mailer.js';
import { createSnapshotStorage } from '../snapshots/snapshots.storage.js';
import { SnapshotsService } from '../snapshots/snapshots.service.js';
import { SecretsRepository } from '../secrets/secrets.repository.js';
import { SecretsService } from '../secrets/secrets.service.js';

export async function registerOctoRoutes(app: FastifyInstance) {
  // Initialize auth middleware
  const authRepository = new AuthRepository();
  const authMailer = new AuthMailer();
  const authService = new AuthService(authRepository, authMailer);
  const requireAuth = createRequireAuth(authService);

  // Initialize repositories and service
  const projectsRepository = new ProjectsRepository();
  const snapshotsRepository = new SnapshotsRepository();
  const snapshotsStorage = createSnapshotStorage();
  // Patched snapshots must go through Secret Vault auto-import like any other capture.
  const secretsService = new SecretsService(new SecretsRepository(), snapshotsStorage);
  const snapshotsService = new SnapshotsService(snapshotsRepository, snapshotsStorage, secretsService);
  const octoService = new OctoService(projectsRepository, snapshotsRepository, undefined, snapshotsService);
  const controller = createOctoController(octoService);

  // Routes
  app.get('/octo/summary', { preHandler: requireAuth }, controller.summary);
  app.post('/octo/ask', { preHandler: requireAuth }, controller.ask);
  app.get('/octo/graph', { preHandler: requireAuth }, controller.graph);
  app.post('/octo/patches/:patchId/approve', { preHandler: requireAuth }, controller.approvePatch);
  app.post('/octo/patches/:patchId/reject', { preHandler: requireAuth }, controller.rejectPatch);
}
