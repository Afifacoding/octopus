import type { FastifyInstance } from 'fastify';

import { createAuthController } from './auth.controller.js';
import { createRequireAuth } from './auth.middleware.js';
import { AuthMailer } from './auth.mailer.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  const repository = new AuthRepository();
  const mailer = new AuthMailer(app.log);
  const service = new AuthService(repository, mailer, app.log);
  const controller = createAuthController(service);
  const requireAuth = createRequireAuth(service);

  app.post('/signup', { config: { rateLimit: { max: 8, timeWindow: 60000 } } }, controller.signup);
  app.post(
    '/request-otp',
    { config: { rateLimit: { max: 6, timeWindow: 60000 } } },
    controller.requestOtp,
  );
  app.post(
    '/verify-otp',
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    controller.verifyOtp,
  );
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: 60000 } } }, controller.login);
  app.post('/logout', controller.logout);
  app.get('/me', controller.me);
  app.patch('/profile', { preHandler: requireAuth }, controller.updateProfile);
  app.get('/extension-connection', { preHandler: requireAuth }, controller.extensionConnection);
}
