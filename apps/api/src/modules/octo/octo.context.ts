/**
 * Octo Context Builder
 * Builds safe workspace context for Octo without exposing secrets
 */

import { ProjectsRepository } from '../projects/projects.repository.js';
import { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import type { WorkspaceContext, WorkspaceProjectContext } from './octo.types.js';

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export class OctoContextBuilder {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly snapshotsRepository: SnapshotsRepository,
  ) {}

  /**
   * Counting rules: only ACTIVE projects owned by the user are included, and
   * `snapshotCount` counts COMPLETED snapshots. FAILED and PENDING/PROCESSING
   * snapshots are reported separately. Uses three queries regardless of the
   * number of projects.
   */
  async buildContext(userId: string, currentProjectId?: string): Promise<WorkspaceContext> {
    const projects = await this.projectsRepository.listProjects({
      ownerId: userId,
      status: 'ACTIVE',
    });

    const projectIds = projects.map((project) => project.id);
    const [statusCounts, completedRefs] = projectIds.length === 0
      ? [[], []]
      : await Promise.all([
          this.snapshotsRepository.countSnapshotsByProjectAndStatus(userId, projectIds),
          this.snapshotsRepository.listCompletedSnapshotRefsForOwner(userId, projectIds),
        ]);

    const countsByProject = new Map<string, { completed: number; failed: number; inProgress: number }>();
    for (const group of statusCounts) {
      const counts = countsByProject.get(group.projectId) ?? { completed: 0, failed: 0, inProgress: 0 };
      if (group.status === 'COMPLETED') counts.completed += group.count;
      else if (group.status === 'FAILED') counts.failed += group.count;
      else counts.inProgress += group.count;
      countsByProject.set(group.projectId, counts);
    }

    const refsByProject = new Map<string, Array<{ id: string; createdAt: string }>>();
    for (const ref of completedRefs) {
      const refs = refsByProject.get(ref.projectId) ?? [];
      refs.push({ id: ref.id, createdAt: toIsoString(ref.createdAt) });
      refsByProject.set(ref.projectId, refs);
    }

    const projectsWithSnapshots: WorkspaceProjectContext[] = projects.map((project) => {
      const counts = countsByProject.get(project.id) ?? { completed: 0, failed: 0, inProgress: 0 };
      const snapshots = refsByProject.get(project.id) ?? [];

      return {
        id: project.id,
        name: project.name,
        color: project.color || 'BLUE',
        snapshotCount: counts.completed,
        failedSnapshotCount: counts.failed,
        inProgressSnapshotCount: counts.inProgress,
        latestSnapshotAt: snapshots[0]?.createdAt ?? null,
        snapshots,
      };
    });

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
