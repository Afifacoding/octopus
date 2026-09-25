import type { FastifyInstance } from 'fastify';

import { createRequireAuth } from '../auth/auth.middleware.js';
import { AuthMailer } from '../auth/auth.mailer.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { AuthService } from '../auth/auth.service.js';
import { createProjectsController } from './projects.controller.js';
import { ProjectsRepository } from './projects.repository.js';
import { ProjectsService } from './projects.service.js';

export async function registerProjectRoutes(app: FastifyInstance) {
  const authRepository = new AuthRepository();
  const authMailer = new AuthMailer();
  const authService = new AuthService(authRepository, authMailer);
  const requireAuth = createRequireAuth(authService);

  const projectsRepository = new ProjectsRepository();
  const projectsService = new ProjectsService(projectsRepository);
  const controller = createProjectsController(projectsService);

  app.post('/projects', { preHandler: requireAuth }, controller.create);
  app.get('/projects', { preHandler: requireAuth }, controller.list);
  app.get('/projects/:id', { preHandler: requireAuth }, controller.getById);
  app.patch('/projects/:id', { preHandler: requireAuth }, controller.update);
  app.delete('/projects/:id', { preHandler: requireAuth }, controller.archive);
  app.delete('/projects/:id/permanent', { preHandler: requireAuth }, controller.deletePermanent);
}
