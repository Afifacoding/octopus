import type { FastifyInstance } from 'fastify';

import { registerAuthRoutes } from '../modules/auth/auth.routes.js';
import { registerOctoRoutes } from '../modules/octo/octo.routes.js';
import { healthController } from '../modules/health/health.controller.js';
import { registerProjectRoutes } from '../modules/projects/projects.routes.js';
import { registerSecretRoutes } from '../modules/secrets/secrets.routes.js';
import { registerSnapshotRoutes } from '../modules/snapshots/snapshots.routes.js';

export async function registerV1Routes(app: FastifyInstance) {
  app.get('/health', healthController);
  app.register(registerAuthRoutes, { prefix: '/auth' });
  app.register(registerOctoRoutes);
  app.register(registerProjectRoutes);
  app.register(registerSnapshotRoutes);
  app.register(registerSecretRoutes);
}
