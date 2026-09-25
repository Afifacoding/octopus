import { afterEach, describe, expect, it, vi } from 'vitest';

import * as vscode from 'vscode';

import { ensureProjectSelection, rememberProjectId } from './selection';
import type { Project } from '../api/projects';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  getRequestTimeoutMs: vi.fn(() => 1000),
}));

vi.mock('../api/projects', () => ({
  listProjects: mocks.listProjects,
  createProject: mocks.createProject,
}));

vi.mock('../config', () => ({
  getRequestTimeoutMs: mocks.getRequestTimeoutMs,
}));

function createMockContext(): vscode.ExtensionContext {
  const store: Record<string, unknown> = {};

  return {
    globalState: {
      get: <T>(key: string, fallback?: T) => (key in store ? (store[key] as T) : (fallback as T)),
      update: async (key: string, value: unknown) => {
        store[key] = value;
      },
    },
  } as unknown as vscode.ExtensionContext;
}

function sampleProjects(): Project[] {
  return [
    {
      id: 'project_1',
      ownerId: 'user_1',
      name: 'octotest2026',
      description: null,
      status: 'ACTIVE',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
      archivedAt: null,
    },
    {
      id: 'project_2',
      ownerId: 'user_1',
      name: 'My Project',
      description: 'Main project',
      status: 'ACTIVE',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
      archivedAt: null,
    },
    {
      id: 'project_3',
      ownerId: 'user_1',
      name: 'Cybersecurity App',
      description: 'Security tooling',
      status: 'ACTIVE',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
      archivedAt: null,
    },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
  mocks.listProjects.mockReset();
  mocks.createProject.mockReset();
  mocks.getRequestTimeoutMs.mockReset();
  mocks.getRequestTimeoutMs.mockReturnValue(1000);
});

describe('ensureProjectSelection', () => {
  it('shows quick pick when forcePromptSelection is true, even with remembered project', async () => {
    const context = createMockContext();
    const projects = sampleProjects();

    mocks.listProjects.mockResolvedValueOnce({ projects });
    await rememberProjectId(context, 'workspace-key', 'project_1');

    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
      label: 'My Project',
      description: 'Main project',
      detail: 'Project ID: project_2 | Status: ACTIVE',
      project: projects[1],
    } as never);

    const selected = await ensureProjectSelection({
      context,
      sessionCookie: 'session-cookie',
      workspaceKey: 'workspace-key',
      workspaceName: 'workspace',
      forcePromptSelection: true,
    });

    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(selected?.id).toBe('project_2');
  });

  it('auto-returns remembered project in default flow without opening quick pick', async () => {
    const context = createMockContext();
    const projects = sampleProjects();

    mocks.listProjects.mockResolvedValueOnce({ projects });
    await rememberProjectId(context, 'workspace-key', 'project_1');

    const quickPickSpy = vi.spyOn(vscode.window, 'showQuickPick');

    const selected = await ensureProjectSelection({
      context,
      sessionCookie: 'session-cookie',
      workspaceKey: 'workspace-key',
      workspaceName: 'workspace',
    });

    expect(quickPickSpy).not.toHaveBeenCalled();
    expect(selected?.id).toBe('project_1');
  });

  it('shows all fetched projects and marks remembered project in quick pick items', async () => {
    const context = createMockContext();
    const projects = sampleProjects();

    mocks.listProjects.mockResolvedValueOnce({ projects });
    await rememberProjectId(context, 'workspace-key', 'project_2');

    const quickPickSpy = vi.spyOn(vscode.window, 'showQuickPick').mockImplementationOnce(async (items) => {
      const projectItems = (items as Array<{ label: string; description?: string; detail?: string; project?: Project }>).filter(
        (item) => item.project,
      );

      expect(projectItems).toHaveLength(3);
      expect(projectItems.map((item) => item.label)).toEqual(['octotest2026', 'My Project', 'Cybersecurity App']);

      const rememberedItem = projectItems.find((item) => item.project?.id === 'project_2');
      expect(rememberedItem?.description).toContain('Current selection');
      expect(rememberedItem?.detail).toContain('Project ID: project_2');
      expect(rememberedItem?.detail).toContain('Status: ACTIVE');

      return projectItems[2] as never;
    });

    const selected = await ensureProjectSelection({
      context,
      sessionCookie: 'session-cookie',
      workspaceKey: 'workspace-key',
      workspaceName: 'workspace',
      forcePromptSelection: true,
    });

    expect(quickPickSpy).toHaveBeenCalledTimes(1);
    expect(selected?.id).toBe('project_3');
  });
});
