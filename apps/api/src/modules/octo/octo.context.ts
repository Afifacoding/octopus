/**
 * Octo Context Builder
 * Builds safe workspace context for Octo without exposing secrets
 */

import { ProjectsRepository } from '../projects/projects.repository.js';
import { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import type { WorkspaceContext } from './octo.types.js';

export class OctoContextBuilder {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly snapshotsRepository: SnapshotsRepository,
  ) {}

  async buildContext(userId: string, currentProjectId?: string): Promise<WorkspaceContext> {
    // Fetch all projects for the user
    const projects = await this.projectsRepository.listProjects({
      ownerId: userId,
      status: 'ACTIVE',
    });

    // Fetch snapshot counts for each project
    const projectsWithSnapshots = await Promise.all(
      projects.map(async (project) => {
        const snapshots = await this.snapshotsRepository.listSnapshotsByProject(project.id);

        return {
          id: project.id,
          name: project.name,
          color: project.color || 'BLUE',
          snapshotCount: snapshots.length,
        };
      }),
    );

    // Get total snapshot count
    const totalSnapshots = projectsWithSnapshots.reduce((sum, p) => sum + p.snapshotCount, 0);

    const context: WorkspaceContext = {
      userId,
      projectCount: projectsWithSnapshots.length,
      snapshotCount: totalSnapshots,
      projects: projectsWithSnapshots,
    };

    // If a current project is specified, add that context
    if (currentProjectId) {
      const currentProject = projectsWithSnapshots.find((p) => p.id === currentProjectId);
      if (currentProject) {
        context.currentProjectId = currentProjectId;
        context.currentProjectName = currentProject.name;
        context.currentProjectSnapshotCount = currentProject.snapshotCount;
      }
    }

    return context;
  }

  /**
   * Build context for a specific snapshot
   */
  async buildSnapshotContext(
    userId: string,
    projectId: string,
    snapshotId: string,
  ): Promise<WorkspaceContext> {
    const context = await this.buildContext(userId, projectId);
    context.currentSnapshotId = snapshotId;
    return context;
  }

  /**
   * Find a project by name (case-insensitive) within user's projects
   */
  async findProjectByName(userId: string, projectName: string): Promise<string | undefined> {
    const projects = await this.projectsRepository.listProjects({
      ownerId: userId,
      status: 'ACTIVE',
    });

    const normalizedSearch = projectName.toLowerCase().trim();
    const match = projects.find((p) => p.name.toLowerCase() === normalizedSearch);
    return match?.id;
  }
}
