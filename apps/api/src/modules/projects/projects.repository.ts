import { prisma } from '../../db/client.js';
import type { ProjectColor } from './projects.colors.js';

type ListProjectsInput = {
  ownerId: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  q?: string;
};

export class ProjectsRepository {
  async createProject(input: { ownerId: string; name: string; description?: string; color?: ProjectColor }) {
    const data = {
      ownerId: input.ownerId,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    };

    return prisma.project.create({
      data,
    });
  }

  async findProjectByOwnerAndName(ownerId: string, name: string) {
    return prisma.project.findFirst({
      where: {
        ownerId,
        status: 'ACTIVE',
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });
  }

  async listProjects(input: ListProjectsInput) {
    return prisma.project.findMany({
      where: {
        ownerId: input.ownerId,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.q
          ? {
              OR: [
                {
                  name: {
                    contains: input.q,
                    mode: 'insensitive',
                  },
                },
                {
                  description: {
                    contains: input.q,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findProjectByIdForOwner(ownerId: string, id: string) {
    return prisma.project.findFirst({
      where: {
        id,
        ownerId,
      },
    });
  }

  async updateProject(
    ownerId: string,
    id: string,
    input: {
      name?: string;
      description?: string;
      color?: ProjectColor | null;
    },
  ) {
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    };

    return prisma.project.updateMany({
      where: {
        id,
        ownerId,
      },
      data,
    });
  }

  async archiveProject(ownerId: string, id: string) {
    return prisma.project.updateMany({
      where: {
        id,
        ownerId,
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });
  }

  async deleteProjectIfNoSnapshots(ownerId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id,
          ownerId,
        },
        select: {
          id: true,
        },
      });

      if (!project) {
        return {
          projectFound: false,
          remainingSnapshots: 0,
          deleted: false,
        } as const;
      }

      const remainingSnapshots = await tx.snapshot.count({
        where: {
          projectId: id,
        },
      });

      if (remainingSnapshots > 0) {
        return {
          projectFound: true,
          remainingSnapshots,
          deleted: false,
        } as const;
      }

      const deleted = await tx.project.deleteMany({
        where: {
          id,
          ownerId,
        },
      });

      return {
        projectFound: true,
        remainingSnapshots: 0,
        deleted: deleted.count > 0,
      } as const;
    });
  }
}
