import { describe, expect, it, beforeEach } from 'vitest';

import { ProjectsService } from './projects.service.js';

type ProjectRecord = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  color: 'BLUE' | 'PURPLE' | 'PINK' | 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'TEAL' | 'CYAN' | 'GRAY' | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

class FakeProjectsRepository {
  projects: ProjectRecord[] = [];
  snapshots: Array<{ id: string; projectId: string }> = [];

  async createProject(input: {
    ownerId: string;
    name: string;
    description?: string;
    color?: 'BLUE' | 'PURPLE' | 'PINK' | 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'TEAL' | 'CYAN' | 'GRAY';
  }) {
    const record: ProjectRecord = {
      id: `project_${this.projects.length + 1}`,
      ownerId: input.ownerId,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    };
    this.projects.push(record);
    return record;
  }

  async findProjectByOwnerAndName(ownerId: string, name: string) {
    return (
      this.projects.find(
        (project) =>
          project.ownerId === ownerId &&
          project.status === 'ACTIVE' &&
          project.name.toLowerCase() === name.toLowerCase(),
      ) ?? null
    );
  }

  async listProjects(input: { ownerId: string; status?: 'ACTIVE' | 'ARCHIVED'; q?: string }) {
    return this.projects
      .filter((project) => project.ownerId === input.ownerId)
      .filter((project) => (input.status ? project.status === input.status : true))
      .filter((project) => {
        if (!input.q) {
          return true;
        }

        const query = input.q.toLowerCase();
        return (
          project.name.toLowerCase().includes(query) ||
          (project.description ? project.description.toLowerCase().includes(query) : false)
        );
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async findProjectByIdForOwner(ownerId: string, id: string) {
    return this.projects.find((project) => project.ownerId === ownerId && project.id === id) ?? null;
  }

  async updateProject(
    ownerId: string,
    id: string,
    input: {
      name?: string;
      description?: string;
      color?: 'BLUE' | 'PURPLE' | 'PINK' | 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'TEAL' | 'CYAN' | 'GRAY' | null;
    },
  ) {
    const project = this.projects.find((item) => item.ownerId === ownerId && item.id === id);
    if (!project) {
      return { count: 0 };
    }

    if (input.name !== undefined) {
      project.name = input.name;
    }

    if (input.description !== undefined) {
      project.description = input.description;
    }

    if (input.color !== undefined) {
      project.color = input.color;
    }

    project.updatedAt = new Date();
    return { count: 1 };
  }

  async archiveProject(ownerId: string, id: string) {
    const project = this.projects.find((item) => item.ownerId === ownerId && item.id === id);
    if (!project) {
      return { count: 0 };
    }

    project.status = 'ARCHIVED';
    project.archivedAt = new Date();
    project.updatedAt = new Date();
    return { count: 1 };
  }

  addSnapshot(projectId: string, snapshotId?: string) {
    this.snapshots.push({
      id: snapshotId ?? `snapshot_${this.snapshots.length + 1}`,
      projectId,
    });
  }

  async deleteProjectIfNoSnapshots(ownerId: string, id: string) {
    const project = this.projects.find((item) => item.ownerId === ownerId && item.id === id) ?? null;
    if (!project) {
      return {
        projectFound: false,
        remainingSnapshots: 0,
        deleted: false,
      } as const;
    }

    const remainingSnapshots = this.snapshots.filter((snapshot) => snapshot.projectId === id).length;
    if (remainingSnapshots > 0) {
      return {
        projectFound: true,
        remainingSnapshots,
        deleted: false,
      } as const;
    }

    this.projects = this.projects.filter((item) => !(item.ownerId === ownerId && item.id === id));
    return {
      projectFound: true,
      remainingSnapshots: 0,
      deleted: true,
    } as const;
  }
}

describe('ProjectsService', () => {
  let repository: FakeProjectsRepository;
  let service: ProjectsService;

  beforeEach(() => {
    repository = new FakeProjectsRepository();
    service = new ProjectsService(repository as never);
  });

  it('allows authenticated owner project creation', async () => {
    const project = await service.createProject('user_1', {
      name: 'My Project',
      description: 'Test project',
      color: 'TEAL',
    });

    expect(project.ownerId).toBe('user_1');
    expect(project.name).toBe('My Project');
    expect(project.color).toBe('TEAL');
  });

  it('creates project without color by default', async () => {
    const project = await service.createProject('user_1', {
      name: 'No Color Project',
    });

    expect(project.color).toBeNull();
  });

  it('rejects duplicate active project names per owner', async () => {
    await service.createProject('user_1', { name: 'My Project' });

    await expect(service.createProject('user_1', { name: 'my project' })).rejects.toMatchObject({
      code: 'PROJECT_NAME_EXISTS',
    });
  });

  it('accepts same project name for different users', async () => {
    await service.createProject('user_1', { name: 'Shared Name' });

    const project = await service.createProject('user_2', { name: 'Shared Name' });
    expect(project.ownerId).toBe('user_2');
  });

  it('lists only owner projects', async () => {
    await service.createProject('user_1', { name: 'User1 Project' });
    await service.createProject('user_2', { name: 'User2 Project' });

    const projects = await service.listProjects('user_1', {});
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('User1 Project');
  });

  it('filters and searches owner projects', async () => {
    await service.createProject('user_1', { name: 'Frontend App', description: 'React' });
    await service.createProject('user_1', { name: 'Backend API', description: 'Fastify' });

    const search = await service.listProjects('user_1', { q: 'front' });
    expect(search).toHaveLength(1);
    expect(search[0]?.name).toBe('Frontend App');
  });

  it('allows owner to access project details', async () => {
    const created = await service.createProject('user_1', { name: 'Owned Project' });

    const found = await service.getProject('user_1', created.id);
    expect(found.id).toBe(created.id);
  });

  it('rejects non-owner project access', async () => {
    const created = await service.createProject('user_1', { name: 'Private Project' });

    await expect(service.getProject('user_2', created.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('returns safe not found for missing project', async () => {
    await expect(service.getProject('user_1', 'missing')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('allows owner to update project', async () => {
    const created = await service.createProject('user_1', { name: 'Old Name' });

    const updated = await service.updateProject('user_1', created.id, {
      name: 'New Name',
      description: 'Updated',
      color: 'BLUE',
    });

    expect(updated.name).toBe('New Name');
    expect(updated.description).toBe('Updated');
    expect(updated.color).toBe('BLUE');
  });

  it('allows clearing project color on update', async () => {
    const created = await service.createProject('user_1', { name: 'Colorful', color: 'PINK' });

    const updated = await service.updateProject('user_1', created.id, {
      color: null,
    });

    expect(updated.color).toBeNull();
  });

  it('rejects non-owner update', async () => {
    const created = await service.createProject('user_1', { name: 'Protected' });

    await expect(service.updateProject('user_2', created.id, { name: 'Changed' })).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('archives project for owner', async () => {
    const created = await service.createProject('user_1', { name: 'To Archive' });

    const archived = await service.archiveProject('user_1', created.id);
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).toBeTruthy();
  });

  it('rejects non-owner archive request', async () => {
    const created = await service.createProject('user_1', { name: 'Private' });

    await expect(service.archiveProject('user_2', created.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('blocks project deletion when exactly one snapshot exists', async () => {
    const created = await service.createProject('user_1', { name: 'Delete Blocked' });
    repository.addSnapshot(created.id, 'snapshot_1');

    await expect(service.deleteProject('user_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_HAS_SNAPSHOTS',
      message: 'Delete all snapshots before deleting this project.',
    });
  });

  it('blocks project deletion when multiple snapshots exist', async () => {
    const created = await service.createProject('user_1', { name: 'Delete Blocked Multi' });
    repository.addSnapshot(created.id, 'snapshot_1');
    repository.addSnapshot(created.id, 'snapshot_2');

    await expect(service.deleteProject('user_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_HAS_SNAPSHOTS',
    });
  });

  it('does not delete project or snapshots when blocked by snapshot dependency', async () => {
    const created = await service.createProject('user_1', { name: 'Keep Project' });
    repository.addSnapshot(created.id, 'snapshot_1');
    repository.addSnapshot(created.id, 'snapshot_2');

    await expect(service.deleteProject('user_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_HAS_SNAPSHOTS',
    });

    expect(repository.projects.some((project) => project.id === created.id)).toBe(true);
    expect(repository.snapshots.filter((snapshot) => snapshot.projectId === created.id)).toHaveLength(2);
  });

  it('allows project deletion when snapshot count is zero', async () => {
    const created = await service.createProject('user_1', { name: 'Delete Allowed' });

    const result = await service.deleteProject('user_1', created.id);
    expect(result).toEqual({
      projectId: created.id,
      deleted: true,
    });
    expect(repository.projects.some((project) => project.id === created.id)).toBe(false);
  });

  it('rejects project deletion for non-owner', async () => {
    const created = await service.createProject('user_1', { name: 'Owner Only Delete' });

    await expect(service.deleteProject('user_2', created.id)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('cannot bypass snapshot dependency rule via direct delete API call to service', async () => {
    const created = await service.createProject('user_1', { name: 'No Bypass' });
    repository.addSnapshot(created.id, 'snapshot_1');

    await expect(service.deleteProject('user_1', created.id)).rejects.toMatchObject({
      code: 'PROJECT_HAS_SNAPSHOTS',
      message: 'Delete all snapshots before deleting this project.',
    });
  });
});
