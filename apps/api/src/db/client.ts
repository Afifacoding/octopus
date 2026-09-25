import { PrismaClient } from '@prisma/client';

declare global {
  var __octopusPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__octopusPrisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__octopusPrisma = prisma;
}
