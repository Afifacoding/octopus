import { buildApp } from './app.js';
import { env } from './config/env.js';

async function start() {
  const app = buildApp();

  try {
    await app.listen({
      host: env.API_HOST,
      port: env.API_PORT,
    });
  } catch (error) {
    app.log.error(error, 'Failed to start API server');
    process.exit(1);
  }
}

void start();
