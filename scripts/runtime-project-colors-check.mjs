import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      color: true,
      ownerId: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 30,
  });

  console.log(JSON.stringify({ projects }, null, 2));
} finally {
  await prisma.$disconnect();
}
