import Fastify from 'fastify';

import { env } from './config/env.js';
import { authReadyHook } from './core/middleware/auth-ready.js';
import { registerErrorHandler } from './core/middleware/error-handler.js';
import { requestContextHook } from './core/middleware/request-context.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { registerV1Routes } from './routes/v1.js';

export function buildApp() {
  const loggerBase = {
    level: env.LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'headers.authorization'],
      remove: true,
    },
  };

  const logger =
    env.NODE_ENV === 'development'
      ? {
          ...loggerBase,
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
            },
          },
        }
      : loggerBase;

  const app = Fastify({
    bodyLimit: env.MAX_REQUEST_SIZE_BYTES,
    logger,
  });

  app.addHook('onRequest', requestContextHook);
  app.addHook('preHandler', authReadyHook);

  registerErrorHandler(app);

  app.register(async (child) => {
    await registerSecurityPlugins(child);
    child.register(registerV1Routes, { prefix: '/api/v1' });
  });

  return app;
}
