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

export async function registerOctoRoutes(app: FastifyInstance) {
  // Initialize auth middleware
  const authRepository = new AuthRepository();
  const authMailer = new AuthMailer();
  const authService = new AuthService(authRepository, authMailer);
  const requireAuth = createRequireAuth(authService);

  // Initialize repositories and service
  const projectsRepository = new ProjectsRepository();
  const snapshotsRepository = new SnapshotsRepository();
  const octoService = new OctoService(projectsRepository, snapshotsRepository);
  const controller = createOctoController(octoService);

  // Routes
  app.get('/octo/summary', { preHandler: requireAuth }, controller.summary);
  app.post('/octo/ask', { preHandler: requireAuth }, controller.ask);
}
