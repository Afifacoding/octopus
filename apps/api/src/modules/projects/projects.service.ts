import { HttpError } from '../../core/errors/http-error.js';
import type { ProjectColor } from './projects.colors.js';
import { ProjectsRepository } from './projects.repository.js';
import type { PublicProject } from './projects.types.js';

type CreateProjectInput = {
  name: string;
  description?: string;
  color?: ProjectColor;
};

type ListProjectsInput = {
  status?: 'ACTIVE' | 'ARCHIVED';
  q?: string;
};

type UpdateProjectInput = {
  name?: string;
  description?: string;
  color?: ProjectColor | null;
};

type DeleteProjectResult = {
  projectId: string;
  deleted: true;
};

export class ProjectsService {
  constructor(private readonly repository: ProjectsRepository) {}

  async createProject(ownerId: string, input: CreateProjectInput) {
    const normalizedName = input.name.trim();
    const normalizedDescription = input.description?.trim();

    const existing = await this.repository.findProjectByOwnerAndName(ownerId, normalizedName);
    if (existing) {
      throw new HttpError(409, 'PROJECT_NAME_EXISTS', 'A project with this name already exists');
    }

    const project = await this.repository.createProject({
      ownerId,
      name: normalizedName,
      ...(normalizedDescription ? { description: normalizedDescription } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    });

    return this.toPublicProject(project);
  }

  async listProjects(ownerId: string, input: ListProjectsInput) {
    const projects = await this.repository.listProjects({
      ownerId,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.q !== undefined ? { q: input.q } : {}),
    });

    return projects.map((project: {
      id: string;
      ownerId: string;
      name: string;
      description: string | null;
      color: ProjectColor | null;
      status: 'ACTIVE' | 'ARCHIVED';
      createdAt: Date;
      updatedAt: Date;
      archivedAt: Date | null;
    }) => this.toPublicProject(project));
  }

  async getProject(ownerId: string, projectId: string) {
    const project = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    return this.toPublicProject(project);
  }

  async updateProject(ownerId: string, projectId: string, input: UpdateProjectInput) {
    const current = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    if (!current) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    if (input.name) {
      const normalizedName = input.name.trim();
      const existing = await this.repository.findProjectByOwnerAndName(ownerId, normalizedName);
      if (existing && existing.id !== projectId) {
        throw new HttpError(409, 'PROJECT_NAME_EXISTS', 'A project with this name already exists');
      }
    }

    const result = await this.repository.updateProject(ownerId, projectId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    });

    if (result.count === 0) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    const updated = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    if (!updated) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    return this.toPublicProject(updated);
  }

  async archiveProject(ownerId: string, projectId: string) {
    const current = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    if (!current) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    if (current.status === 'ARCHIVED') {
      return this.toPublicProject(current);
    }

    const result = await this.repository.archiveProject(ownerId, projectId);

    if (result.count === 0) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    const archived = await this.repository.findProjectByIdForOwner(ownerId, projectId);
    if (!archived) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    return this.toPublicProject(archived);
  }

  async deleteProject(ownerId: string, projectId: string): Promise<DeleteProjectResult> {
    const result = await this.repository.deleteProjectIfNoSnapshots(ownerId, projectId);

    if (!result.projectFound) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    if (result.remainingSnapshots > 0) {
      throw new HttpError(409, 'PROJECT_HAS_SNAPSHOTS', 'Delete all snapshots before deleting this project.');
    }

    if (!result.deleted) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    return {
      projectId,
      deleted: true,
    };
  }

  private toPublicProject(project: {
    id: string;
    ownerId: string;
    name: string;
    description: string | null;
    color: ProjectColor | null;
    status: 'ACTIVE' | 'ARCHIVED';
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
  }): PublicProject {
    return {
      id: project.id,
      ownerId: project.ownerId,
      name: project.name,
      description: project.description,
      color: project.color,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
    };
  }
}
