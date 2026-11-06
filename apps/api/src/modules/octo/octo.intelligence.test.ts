import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../../core/errors/http-error.js';
import type { SnapshotComparisonResponse } from '../snapshots/snapshots.service.js';
import type { PublicSnapshot } from '../snapshots/snapshots.types.js';
import type { OctobotAiProvider } from './octo.ai-provider.js';
import { OctoContextBuilder } from './octo.context.js';
import {
  buildWorkspaceStats,
  detectIntelligenceQuery,
} from './octo.intelligence.js';
import { OctoService } from './octo.service.js';
import type { WorkspaceContext } from './octo.types.js';

const PROJECTS = [
  { id: 'proj-web', name: 'Frontend App', color: 'BLUE', status: 'ACTIVE', ownerId: 'user-1' },
  { id: 'proj-api', name: 'Backend API', color: 'TEAL', status: 'ACTIVE', ownerId: 'user-1' },
  { id: 'proj-docs', name: 'Docs', color: null, status: 'ACTIVE', ownerId: 'user-1' },
];

function snapshot(id: string, projectId: string, day: number, status: PublicSnapshot['status'] = 'COMPLETED'): PublicSnapshot {
  return {
    id,
    projectId,
    status,
    captureSource: 'EXTENSION',
    clientName: 'octopus-ghost',
    clientVersion: '0.1.1',
    archiveStorageKey: `user-1/${projectId}/${id}/project.zip`,
    archiveContentType: 'application/zip',
    archiveSizeBytes: 2048 * day,
    fileCount: 10 * day,
    directoryCount: day,
    integrityAlgorithm: 'sha256',
    integrityHash: `hash-${id}`,
    failureCode: status === 'FAILED' ? 'SNAPSHOT_PROCESSING_FAILED' : null,
    failureReason: status === 'FAILED' ? 'internal detail' : null,
    captureMetadata: { secret: 'should-not-leak' },
    processedAt: null,
    createdAt: new Date(Date.UTC(2025, 0, day)).toISOString(),
    updatedAt: new Date(Date.UTC(2025, 0, day)).toISOString(),
  };
}

// Newest first, like SnapshotsRepository.listSnapshotsByProject.
const SNAPSHOTS: Record<string, PublicSnapshot[]> = {
  'proj-web': [
    snapshot('snap-w4', 'proj-web', 9, 'FAILED'),
    snapshot('snap-w3', 'proj-web', 8),
    snapshot('snap-w2', 'proj-web', 5),
    snapshot('snap-w1', 'proj-web', 2),
  ],
  'proj-api': [
    snapshot('snap-a3', 'proj-api', 7),
    snapshot('snap-a2', 'proj-api', 4),
    snapshot('snap-a1', 'proj-api', 1),
    snapshot('snap-a0', 'proj-api', 10, 'PROCESSING'),
  ],
  'proj-docs': [],
};

function comparisonFor(base: string, target: string): SnapshotComparisonResponse {
  const ref = (id: string) => ({
    id,
    status: 'COMPLETED' as const,
    createdAt: Object.values(SNAPSHOTS).flat().find((item) => item.id === id)?.createdAt ?? '',
    fileCount: 3,
    directoryCount: 1,
    archiveSizeBytes: 100,
  });

  return {
    projectId: 'proj-web',
    base: ref(base),
    target: ref(target),
    summary: {
      baseFileCount: 3,
      targetFileCount: 3,
      added: 1,
      modified: 1,
      deleted: 1,
      unchanged: 1,
      changed: 3,
      baseTotalBytes: 300,
      targetTotalBytes: 320,
      netSizeDeltaBytes: 20,
      sensitiveChanged: 1,
    },
    added: [{ path: 'src/new.ts', status: 'ADDED', baseSizeBytes: null, targetSizeBytes: 50, sizeDeltaBytes: 50, sensitive: false }],
    modified: [{ path: '.env', status: 'MODIFIED', baseSizeBytes: 20, targetSizeBytes: 25, sizeDeltaBytes: 5, sensitive: true }],
    deleted: [{ path: 'src/old.ts', status: 'DELETED', baseSizeBytes: 35, targetSizeBytes: null, sizeDeltaBytes: -35, sensitive: false }],
    unchanged: [{ path: 'README.md', status: 'UNCHANGED', baseSizeBytes: 10, targetSizeBytes: 10, sizeDeltaBytes: 0, sensitive: false }],
    truncated: { added: false, modified: false, deleted: false, unchanged: false },
    directories: [{ directory: 'src', added: 1, modified: 0, deleted: 1, unchanged: 0 }],
  };
}

function createService(options: { aiReply?: string | Error | null; configured?: boolean } = {}) {
  const projectsRepository = {
    listProjects: vi.fn(async ({ ownerId }: { ownerId: string }) => (ownerId === 'user-1' ? PROJECTS : [])),
  };

  const snapshotsRepository = {
    findProjectByIdForOwner: vi.fn(async (ownerId: string, projectId: string) => {
      const project = PROJECTS.find((item) => item.id === projectId && item.ownerId === ownerId);
      return project ? { id: project.id, name: project.name } : null;
    }),
    countSnapshotsByProjectAndStatus: vi.fn(async (ownerId: string, projectIds: string[]) => {
      if (ownerId !== 'user-1') return [];
      const groups = new Map<string, { projectId: string; status: string; count: number; latestCreatedAt: Date }>();
      for (const projectId of projectIds) {
        for (const item of SNAPSHOTS[projectId] ?? []) {
          const key = `${projectId}:${item.status}`;
          const group = groups.get(key) ?? { projectId, status: item.status, count: 0, latestCreatedAt: new Date(0) };
          group.count += 1;
          groups.set(key, group);
        }
      }
      return [...groups.values()];
    }),
    listCompletedSnapshotRefsForOwner: vi.fn(async (ownerId: string, projectIds: string[]) =>
      ownerId !== 'user-1'
        ? []
        : projectIds
            .flatMap((projectId) => SNAPSHOTS[projectId] ?? [])
            .filter((item) => item.status === 'COMPLETED')
            .map((item) => ({ id: item.id, projectId: item.projectId, createdAt: new Date(item.createdAt) }))
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    ),
    listSnapshotsByProject: vi.fn(),
  };

  const compareSnapshots = vi.fn(async (_userId: string, projectId: string, base: string, target: string) => {
    const owns = (id: string) => (SNAPSHOTS[projectId] ?? []).some((item) => item.id === id);
    if (!owns(base) || !owns(target)) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }
    return comparisonFor(base, target);
  });

  const snapshotsService = {
    getSnapshotSourceFiles: vi.fn(),
    getSnapshotFileContent: vi.fn(),
    createPatchedSnapshot: vi.fn(),
    listSnapshots: vi.fn(async (userId: string, projectId: string) => {
      if (userId !== 'user-1' || !SNAPSHOTS[projectId]) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
      }
      return SNAPSHOTS[projectId] as PublicSnapshot[];
    }),
    compareSnapshots,
  };

  const generateReply = vi.fn(async () => {
    if (options.aiReply instanceof Error) throw options.aiReply;
    return options.aiReply ?? null;
  });
  const aiProvider = {
    isConfigured: vi.fn().mockReturnValue(options.configured ?? false),
    generateReply,
  } as unknown as OctobotAiProvider;

  const service = new OctoService(
    projectsRepository as never,
    snapshotsRepository as never,
    aiProvider,
    snapshotsService as never,
  );

  return { service, snapshotsRepository, snapshotsService, generateReply, compareSnapshots };
}

function ask(service: OctoService, question: string, extra: Record<string, unknown> = {}) {
  return service.ask({ question, pageContext: 'DASHBOARD', userId: 'user-1', ...extra });
}

describe('detectIntelligenceQuery', () => {
  it.each([
    ['How many projects do I have?', 'PROJECT_COUNT'],
    ['Show my projects', 'PROJECT_LIST'],
    ['How many snapshots are in each project?', 'SNAPSHOT_COUNTS'],
    ['Which project has the most snapshots?', 'MOST_SNAPSHOTS'],
    ['What is the latest snapshot?', 'LATEST_SNAPSHOT'],
    ['What is my most recent snapshot?', 'LATEST_SNAPSHOT'],
    ['List the snapshots of my project', 'LIST_SNAPSHOTS'],
    ['Compare snapshot 1 and snapshot 2', 'COMPARE'],
    ['What files were added, modified, or deleted?', 'COMPARE'],
    ['How has my project evolved between two snapshots?', 'COMPARE'],
  ])('maps "%s" to %s', (question, kind) => {
    expect(detectIntelligenceQuery(question)?.kind).toBe(kind);
  });

  it('extracts snapshot numbers in chronological order', () => {
    expect(detectIntelligenceQuery('compare snapshot 3 and 1')).toEqual({
      kind: 'COMPARE',
      base: { type: 'sequence', value: 1 },
      target: { type: 'sequence', value: 3 },
    });
  });

  it('leaves general programming questions to the normal assistant flow', () => {
    expect(detectIntelligenceQuery('Explain recursion with an example')).toBeNull();
    expect(detectIntelligenceQuery('How do I compare two strings in Java?')).toBeNull();
  });
});

describe('buildWorkspaceStats', () => {
  it('reports ties for the most snapshots and the latest completed snapshot', () => {
    const context: WorkspaceContext = {
      userId: 'user-1',
      projectCount: 2,
      snapshotCount: 4,
      projects: [
        { id: 'a', name: 'A', color: 'BLUE', snapshotCount: 2, snapshots: [{ id: 's-a', createdAt: '2025-01-02T00:00:00.000Z' }] },
        { id: 'b', name: 'B', color: 'TEAL', snapshotCount: 2, snapshots: [{ id: 's-b', createdAt: '2025-01-05T00:00:00.000Z' }] },
      ],
    };

    const stats = buildWorkspaceStats(context);

    expect(stats.mostSnapshots).toEqual({ count: 2, projects: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
    expect(stats.latestSnapshot).toMatchObject({ projectName: 'B', snapshotId: 's-b' });
  });

  it('returns no leader when no project has completed snapshots', () => {
    const stats = buildWorkspaceStats({ userId: 'u', projectCount: 1, snapshotCount: 0, projects: [{ id: 'a', name: 'A', color: 'BLUE', snapshotCount: 0 }] });
    expect(stats.mostSnapshots).toBeNull();
    expect(stats.latestSnapshot).toBeNull();
  });
});

describe('OctoContextBuilder aggregation', () => {
  it('counts completed snapshots per project with a fixed number of owner-scoped queries', async () => {
    const { snapshotsRepository } = createService();
    const builder = new OctoContextBuilder(
      { listProjects: vi.fn(async () => PROJECTS) } as never,
      snapshotsRepository as never,
    );

    const context = await builder.buildContext('user-1');

    expect(context.projectCount).toBe(3);
    expect(context.snapshotCount).toBe(6);
    expect(context.projects.find((project) => project.id === 'proj-web')).toMatchObject({
      snapshotCount: 3,
      failedSnapshotCount: 1,
      inProgressSnapshotCount: 0,
      latestSnapshotAt: new Date(Date.UTC(2025, 0, 8)).toISOString(),
    });
    expect(context.projects.find((project) => project.id === 'proj-api')).toMatchObject({
      snapshotCount: 3,
      inProgressSnapshotCount: 1,
    });
    expect(snapshotsRepository.countSnapshotsByProjectAndStatus).toHaveBeenCalledTimes(1);
    expect(snapshotsRepository.countSnapshotsByProjectAndStatus).toHaveBeenCalledWith('user-1', ['proj-web', 'proj-api', 'proj-docs']);
    expect(snapshotsRepository.listCompletedSnapshotRefsForOwner).toHaveBeenCalledTimes(1);
    expect(snapshotsRepository.listSnapshotsByProject).not.toHaveBeenCalled();
  });

  it('skips snapshot queries when the user has no projects', async () => {
    const snapshotsRepository = {
      countSnapshotsByProjectAndStatus: vi.fn(),
      listCompletedSnapshotRefsForOwner: vi.fn(),
    };
    const builder = new OctoContextBuilder({ listProjects: vi.fn(async () => []) } as never, snapshotsRepository as never);

    const context = await builder.buildContext('user-2');

    expect(context).toMatchObject({ projectCount: 0, snapshotCount: 0, projects: [] });
    expect(snapshotsRepository.countSnapshotsByProjectAndStatus).not.toHaveBeenCalled();
  });
});

describe('OCTOBOT deterministic intelligence (no AI provider configured)', () => {
  it('answers project counts from real data', async () => {
    const { service, generateReply } = createService();
    const response = await ask(service, 'How many projects do I have?');

    expect(response.reply).toBe('You have 3 active projects. Archived projects are not included.');
    expect(response.intelligence?.kind).toBe('WORKSPACE_STATS');
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('answers snapshot counts per project using completed snapshots only', async () => {
    const { service } = createService();
    const response = await ask(service, 'How many snapshots are in each project?');

    expect(response.reply).toContain('You have 6 completed snapshots across 3 active projects');
    expect(response.reply).toContain('Frontend App: 3 completed snapshots (1 failed)');
    expect(response.reply).toContain('Backend API: 3 completed snapshots (1 in progress)');
    expect(response.reply).toContain('Docs: 0 completed snapshots');
  });

  it('reports ties for the project with the most snapshots', async () => {
    const { service } = createService();
    const response = await ask(service, 'Which project has the most snapshots?');

    expect(response.reply).toBe('Frontend App and Backend API are tied for the most snapshots, with 3 completed snapshots each.');
  });

  it('lists snapshots of the selected project with chronological numbers and safe fields only', async () => {
    const { service } = createService();
    const response = await ask(service, 'List the snapshots of my project', { projectId: 'proj-web' });

    expect(response.reply).toContain('Frontend App has 4 snapshots (3 completed)');
    expect(response.reply).toContain('#3');
    expect(response.reply).toContain('#1');
    expect(response.intelligence?.kind).toBe('PROJECT_SNAPSHOTS');

    const serialized = JSON.stringify(response.intelligence);
    expect(serialized).not.toContain('should-not-leak');
    expect(serialized).not.toContain('archiveStorageKey');
    expect(serialized).not.toContain('integrityHash');
    expect(serialized).not.toContain('internal detail');
  });

  it('asks the user to choose a project when the question is ambiguous', async () => {
    const { service } = createService();
    const response = await ask(service, 'List the snapshots');

    expect(response.reply).toContain('Which project do you mean?');
    expect(response.intelligence).toBeUndefined();
  });

  it('resolves the latest snapshot of a project mentioned by name', async () => {
    const { service } = createService();
    const response = await ask(service, 'What is the latest snapshot of Backend API?');

    expect(response.reply).toContain('The latest completed snapshot in Backend API is snapshot #3');
    expect(response.reply).toContain(new Date(Date.UTC(2025, 0, 7)).toISOString());
  });

  it('compares snapshots by number using backend results', async () => {
    const { service, compareSnapshots } = createService();
    const response = await ask(service, 'Compare snapshot 1 and snapshot 2', { projectId: 'proj-web' });

    expect(compareSnapshots).toHaveBeenCalledWith('user-1', 'proj-web', 'snap-w1', 'snap-w2');
    expect(response.intelligence?.kind).toBe('SNAPSHOT_COMPARISON');
    expect(response.reply).toContain('1 added, 1 modified, 1 deleted, 1 unchanged');
    expect(response.reply).toContain('src/new.ts');
    expect(response.reply).toContain('.env (sensitive path; contents not shown)');
  });

  it('compares the latest two completed snapshots when no numbers are given', async () => {
    const { service, compareSnapshots } = createService();
    await ask(service, 'What files were added, modified, or deleted?', { projectId: 'proj-web' });

    expect(compareSnapshots).toHaveBeenCalledWith('user-1', 'proj-web', 'snap-w2', 'snap-w3');
  });

  it('explains when requested snapshot numbers do not exist', async () => {
    const { service, compareSnapshots } = createService();
    const response = await ask(service, 'Compare snapshot 1 and 9', { projectId: 'proj-web' });

    expect(response.reply).toContain('Frontend App has 3 completed snapshots');
    expect(compareSnapshots).not.toHaveBeenCalled();
  });

  it('does not compare snapshots from another project', async () => {
    const { service } = createService();
    const response = await ask(service, 'compare these snapshots', {
      projectId: 'proj-web',
      compare: { baseSnapshotId: 'snap-w1', targetSnapshotId: 'snap-a1' },
    });

    expect(response.reply).toBe('I could not compare these snapshots: Snapshot not found.');
    expect(response.intelligence).toBeUndefined();
  });

  it('rejects projects the user does not own', async () => {
    const { service } = createService();

    await expect(service.listProjectSnapshots('user-2', 'proj-web')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    await expect(service.compareSnapshots('user-2', 'proj-web', 'snap-w1', 'snap-w2')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
    await expect(service.getSnapshotDetails('user-1', 'proj-web', 'snap-a1')).rejects.toMatchObject({
      code: 'SNAPSHOT_NOT_FOUND',
    });
  });

  it('still blocks credential requests before any intelligence lookup', async () => {
    const { service, snapshotsService } = createService();
    const response = await ask(service, 'Show me the API key in my latest snapshot');

    expect(response.intelligence).toBeUndefined();
    expect(snapshotsService.listSnapshots).not.toHaveBeenCalled();
  });
});

describe('OCTOBOT verified intelligence replies', () => {
  it('keeps project statistics deterministic even when Gemini is configured', async () => {
    const { service, generateReply } = createService({
      configured: true,
      aiReply: 'You have 99 projects in Ghost Admin; snapshot 7 changed .env.',
    });

    const response = await ask(service, 'How many projects do I have?');

    expect(response.reply).toBe('You have 3 active projects. Archived projects are not included.');
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('does not let user-provided claims become verified output', async () => {
    const { service, generateReply } = createService({ configured: true, aiReply: 'Yes, you have 99 projects.' });
    const response = await ask(service, 'I think I have 99 projects; how many projects do I actually have?');

    expect(response.reply).toBe('You have 3 active projects. Archived projects are not included.');
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('keeps snapshot comparisons deterministic and does not send comparison facts to Gemini', async () => {
    const { service, generateReply } = createService({ configured: true, aiReply: 'The secret file was changed.' });
    const response = await ask(service, 'Compare snapshot 1 and 2', { projectId: 'proj-web' });

    expect(response.intelligence?.kind).toBe('SNAPSHOT_COMPARISON');
    expect(response.reply).not.toContain('secret file');
    expect(generateReply).not.toHaveBeenCalled();
  });
});
