import { prisma } from '../../db/client.js';

export type DatabaseHealthCheck = () => Promise<void>;

async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

export async function getHealthStatus(
  checkDatabase: DatabaseHealthCheck = checkDatabaseConnection,
) {
  try {
    await checkDatabase();
    return {
      status: 'ok' as const,
      service: 'octopus-api',
      database: 'connected' as const,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      status: 'unavailable' as const,
      service: 'octopus-api',
      database: 'unavailable' as const,
      timestamp: new Date().toISOString(),
    };
  }
}
