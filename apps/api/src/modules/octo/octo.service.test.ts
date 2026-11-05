import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OctoService } from './octo.service.js';
import { matchIntent, extractProjectName, getContextualProjectId } from './octo.intents.js';
import { checkSecurityBoundary } from './octo.security.js';
import type { OctobotAiProvider } from './octo.ai-provider.js';
import type { WorkspaceContext } from './octo.types.js';

describe('Octo Intent Matching', () => {
  it('should match PROJECT_COUNT intent', () => {
    const result = matchIntent('How many projects do I have?');
    expect(result.intent).toBe('PROJECT_COUNT');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should match PROJECT_LIST intent', () => {
    const result = matchIntent('Show me my projects');
    expect(result.intent).toBe('PROJECT_LIST');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should match SNAPSHOT_COUNT intent', () => {
    const result = matchIntent('How many snapshots do I have?');
    expect(result.intent).toBe('SNAPSHOT_COUNT');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should match RESTORE_GUIDANCE intent', () => {
    const result = matchIntent('How do I restore a snapshot?');
    expect(result.intent).toBe('RESTORE_GUIDANCE');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should match WHAT_IS_BLUEPRINT intent', () => {
    const result = matchIntent('What is Blueprint?');
    expect(result.intent).toBe('WHAT_IS_BLUEPRINT');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should match UNKNOWN for unrecognized questions', () => {
    const result = matchIntent('Tell me about the weather');
    expect(result.intent).toBe('UNKNOWN');
  });
});

describe('Octo Security', () => {
  it('should block password requests', () => {
    const match = matchIntent('What is my password?');
    const result = checkSecurityBoundary('What is my password?', match);
    expect(result.isBlocked).toBe(true);
    expect(result.message).toContain("can't access");
  });

  it('should block api key requests', () => {
    const match = matchIntent('What are my credentials?');
    const result = checkSecurityBoundary('What are my credentials?', match);
    expect(result.isBlocked).toBe(true);
  });

  it('should block secret requests', () => {
    const match = matchIntent('What are my secrets?');
    const result = checkSecurityBoundary('What are my secrets?', match);
    expect(result.isBlocked).toBe(true);
  });

  it('should allow non-sensitive questions', () => {
    const match = matchIntent('How many projects do I have?');
    const result = checkSecurityBoundary('How many projects do I have?', match);
    expect(result.isBlocked).toBe(false);
  });
});

describe('Octo Project Extraction', () => {
  it('should extract project name from question', () => {
    const projectName = extractProjectName('Tell me about project MyApp');
    expect(projectName).toBe('MyApp');
  });

  it('should extract project name with my pattern', () => {
    const projectName = extractProjectName('Tell me about my frontend-app project');
    expect(projectName).toBe('frontend-app');
  });
});

describe('Octo Contextual Project ID', () => {
  it('should use current project for "it" references', () => {
    const projectId = getContextualProjectId(
      'How many snapshots does it have?',
      'project-123',
    );
    expect(projectId).toBe('project-123');
  });

  it('should ignore current project for unrelated questions', () => {
    const projectId = getContextualProjectId(
      'What is Blueprint?',
      'project-123',
    );
    expect(projectId).toBeUndefined();
  });

  it('should return undefined when no current project', () => {
    const projectId = getContextualProjectId('How many snapshots does it have?', undefined);
    expect(projectId).toBeUndefined();
  });
});

describe('Octo Response Generation', () => {
  let service: OctoService;

  beforeEach(() => {
    // Create mock repositories
    const mockProjectsRepository = {
      listProjects: vi.fn(() =>
        Promise.resolve([
          {
            id: 'proj-1',
            name: 'Frontend App',
            color: 'BLUE',
            status: 'ACTIVE',
            ownerId: 'user-1',
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
          },
          {
            id: 'proj-2',
            name: 'Backend API',
            color: 'TEAL',
            status: 'ACTIVE',
            ownerId: 'user-1',
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
          },
        ]),
      ),
      findProjectByIdForOwner: vi.fn(),
      findProjectByOwnerAndName: vi.fn(),
      updateProject: vi.fn(),
      createProject: vi.fn(),
      archiveProject: vi.fn(),
    } as never;

    const mockSnapshotsRepository = {
      listSnapshotsByProject: vi.fn((projectId: string) => {
        if (projectId === 'proj-1') return Promise.resolve(Array(4).fill({}));
        if (projectId === 'proj-2') return Promise.resolve(Array(8).fill({}));
        return Promise.resolve([]);
      }),
      findSnapshotByIdForProject: vi.fn(),
      findSnapshotByIdForOwner: vi.fn(),
      createSnapshot: vi.fn(),
      updateSnapshot: vi.fn(),
      deleteSnapshot: vi.fn(),
      deleteSnapshotWithDependencies: vi.fn(),
    } as never;

    const aiProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      generateReply: vi.fn(async (question: string, _history: unknown[], context: WorkspaceContext) => {
        const intent = matchIntent(question).intent;
        if (intent === 'PROJECT_COUNT') return `${context.projectCount} projects`;
        if (intent === 'PROJECT_LIST') return context.projects.map((project) => project.name).join('\n');
        if (intent === 'SNAPSHOT_COUNT') return `${context.snapshotCount} snapshots`;
        return 'OCTOBOT response';
      }),
    } as unknown as OctobotAiProvider;

    service = new OctoService(mockProjectsRepository, mockSnapshotsRepository, aiProvider);
  });

  it('should answer PROJECT_COUNT correctly', async () => {
    const response = await service.ask({
      question: 'How many projects do I have?',
      pageContext: 'DASHBOARD',
      userId: 'user-1',
    });

    expect(response.reply).toContain('2');
    expect(response.intent).toBe('PROJECT_COUNT');
  });

  it('should answer PROJECT_LIST correctly', async () => {
    const response = await service.ask({
      question: 'Show me my projects',
      pageContext: 'DASHBOARD',
      userId: 'user-1',
    });

    expect(response.reply).toContain('Frontend App');
    expect(response.reply).toContain('Backend API');
  });

  it('should answer SNAPSHOT_COUNT correctly', async () => {
    const response = await service.ask({
      question: 'How many snapshots do I have?',
      pageContext: 'DASHBOARD',
      userId: 'user-1',
    });

    expect(response.reply).toContain('12');
    expect(response.intent).toBe('SNAPSHOT_COUNT');
  });

  it('should block sensitive questions', async () => {
    const response = await service.ask({
      question: 'What is my password?',
      pageContext: 'DASHBOARD',
      userId: 'user-1',
    });

    expect(response.reply).toContain("can't access");
    expect(response.reply).not.toContain('password123');
  });

  it('should include suggestions in response', async () => {
    const response = await service.ask({
      question: 'How many projects do I have?',
      pageContext: 'DASHBOARD',
      userId: 'user-1',
    });

    expect(response.suggestions).toBeDefined();
    expect(Array.isArray(response.suggestions)).toBe(true);
  });

  it('should provide summary with workspace stats', async () => {
    const response = await service.ask({
      question: 'How many projects do I have?',
      pageContext: 'DASHBOARD',
      userId: 'user-1',
    });

    expect(response.summary.projectCount).toBe(2);
    expect(response.summary.snapshotCount).toBe(12);
  });
});

describe('Octo getSummary', () => {
  it('should return workspace summary', async () => {
    const mockProjectsRepository = {
      listProjects: vi.fn(() =>
        Promise.resolve([
          {
            id: 'proj-1',
            name: 'App',
            color: 'BLUE',
            status: 'ACTIVE',
            ownerId: 'user-1',
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
          },
        ]),
      ),
    } as never;

    const mockSnapshotsRepository = {
      listSnapshotsByProject: vi.fn(() => Promise.resolve(Array(3).fill({}))),
    } as never;

    const service = new OctoService(mockProjectsRepository, mockSnapshotsRepository);
    const summary = await service.getSummary('user-1');

    expect(summary.projectCount).toBe(1);
    expect(summary.snapshotCount).toBe(3);
    expect(summary.greeting).toBeDefined();
    expect(summary.suggestions).toBeDefined();
  });
});

describe('OCTOBOT provider integration', () => {
  it('uses the configured provider and excludes blocked credential questions from history', async () => {
    const generateReply = vi.fn().mockResolvedValue('OCTOBOT can explain recursion.');
    const aiProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      generateReply,
    } as unknown as OctobotAiProvider;
    const service = new OctoService(
      { listProjects: vi.fn().mockResolvedValue([]) } as never,
      {} as never,
      aiProvider,
    );

    const response = await service.ask({
      question: 'Explain recursion',
      pageContext: 'DASHBOARD',
      userId: 'user-1',
      history: [
        { role: 'user', content: 'What is my API key?' },
        { role: 'user', content: 'Explain functions' },
        { role: 'assistant', content: 'Functions package reusable behavior.' },
      ],
    });

    expect(response.reply).toBe('OCTOBOT can explain recursion.');
    expect(response.summary.projectCount).toBe(0);
    expect(generateReply).toHaveBeenCalledWith(
      'Explain recursion',
      [
        { role: 'user', content: 'Explain functions' },
        { role: 'assistant', content: 'Functions package reusable behavior.' },
      ],
      expect.objectContaining({ projectCount: 0, snapshotCount: 0 }),
      {},
    );
  });
});

describe('OCTOBOT patch proposals', () => {
  it('requires owner approval and creates a derived snapshot from a validated proposal', async () => {
    const generateReply = vi.fn().mockResolvedValue([
      'I updated the requested constant.',
      '```octobot-patch',
      JSON.stringify({
        filePath: 'project/src/index.ts',
        summary: 'Increment the count',
        proposedContent: 'export const count = 2;',
      }),
      '```',
    ].join('\n'));
    const aiProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      generateReply,
    } as unknown as OctobotAiProvider;
    const createPatchedSnapshot = vi.fn().mockResolvedValue({ id: 'derived-snapshot' });
    const snapshotsService = {
      getSnapshotSourceFiles: vi.fn().mockResolvedValue({
        files: [{ path: 'project/src/index.ts', content: 'export const count = 1;' }],
        truncated: false,
      }),
      getSnapshotFileContent: vi.fn().mockResolvedValue({
        file: {
          path: 'project/src/index.ts',
          supported: true,
          redactionApplied: false,
          truncated: false,
          content: 'export const count = 1;',
        },
      }),
      createPatchedSnapshot,
    };
    const service = new OctoService(
      { listProjects: vi.fn().mockResolvedValue([]) } as never,
      {} as never,
      aiProvider,
      snapshotsService as never,
    );

    const response = await service.ask({
      question: 'Please patch project/src/index.ts',
      pageContext: 'DASHBOARD',
      userId: 'owner-1',
      projectId: 'project-1',
      snapshotId: 'snapshot-1',
      mode: 'project-assistant',
    });

    expect(response.patchProposal?.filePath).toBe('project/src/index.ts');
    expect(response.patchProposal?.diff).toContain('+export const count = 2;');
    await expect(service.approvePatch('another-user', response.patchProposal!.patchId)).rejects.toMatchObject({
      code: 'OCTOBOT_PATCH_NOT_FOUND',
    });
    await expect(service.approvePatch('owner-1', response.patchProposal!.patchId))
      .resolves.toMatchObject({ id: 'derived-snapshot' });
    expect(createPatchedSnapshot).toHaveBeenCalledWith(
      'owner-1',
      'project-1',
      'snapshot-1',
      'project/src/index.ts',
      'export const count = 1;',
      'export const count = 2;',
    );
  });
});
