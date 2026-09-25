import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OctoService } from './octo.service.js';
import { matchIntent, extractProjectName, getContextualProjectId } from './octo.intents.js';
import { checkSecurityBoundary } from './octo.security.js';
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
    } as any;

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
    } as any;

    service = new OctoService(mockProjectsRepository, mockSnapshotsRepository);
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
    } as any;

    const mockSnapshotsRepository = {
      listSnapshotsByProject: vi.fn(() => Promise.resolve(Array(3).fill({}))),
    } as any;

    const service = new OctoService(mockProjectsRepository, mockSnapshotsRepository);
    const summary = await service.getSummary('user-1');

    expect(summary.projectCount).toBe(1);
    expect(summary.snapshotCount).toBe(3);
    expect(summary.greeting).toBeDefined();
    expect(summary.suggestions).toBeDefined();
  });
});
