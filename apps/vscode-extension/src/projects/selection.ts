import * as vscode from 'vscode';

import { createProject, listProjects, type Project } from '../api/projects';
import { getRequestTimeoutMs } from '../config';

const PROJECT_SELECTION_KEY = 'octopus.selectedProjectByWorkspace';

type SelectionMap = Record<string, string>;

async function readSelectionMap(context: vscode.ExtensionContext): Promise<SelectionMap> {
  return context.globalState.get<SelectionMap>(PROJECT_SELECTION_KEY, {});
}

async function writeSelectionMap(context: vscode.ExtensionContext, map: SelectionMap) {
  await context.globalState.update(PROJECT_SELECTION_KEY, map);
}

export async function getRememberedProjectId(context: vscode.ExtensionContext, workspaceKey: string) {
  const map = await readSelectionMap(context);
  return map[workspaceKey] ?? null;
}

export async function rememberProjectId(
  context: vscode.ExtensionContext,
  workspaceKey: string,
  projectId: string,
) {
  const map = await readSelectionMap(context);
  map[workspaceKey] = projectId;
  await writeSelectionMap(context, map);
}

export async function ensureProjectSelection(options: {
  context: vscode.ExtensionContext;
  sessionCookie: string;
  workspaceKey: string;
  workspaceName: string;
  forcePromptSelection?: boolean;
}): Promise<Project | null> {
  const timeoutMs = getRequestTimeoutMs();
  const projectsResult = await listProjects({
    cookie: options.sessionCookie,
    timeoutMs,
  });

  const projects = projectsResult.projects;

  const rememberedId = await getRememberedProjectId(options.context, options.workspaceKey);
  if (rememberedId && !options.forcePromptSelection) {
    const remembered = projects.find((item) => item.id === rememberedId);
    if (remembered) {
      return remembered;
    }
  }

  if (projects.length === 0) {
    const shouldCreate = await vscode.window.showInformationMessage(
      'No OCTOPUS projects found. Create one for this workspace?',
      'Create Project',
      'Cancel',
    );

    if (shouldCreate !== 'Create Project') {
      return null;
    }

    return createProjectFromPrompt(options.sessionCookie, options.workspaceName);
  }

  type ProjectQuickPickItem = vscode.QuickPickItem & { project?: Project; action?: 'create' };

  const quickPickItems: ProjectQuickPickItem[] = [
    ...projects.map((project) => ({
      label: project.name,
      description:
        project.id === rememberedId
          ? project.description
            ? `Current selection • ${project.description}`
            : 'Current selection'
          : project.description ?? 'No description',
      detail: `Project ID: ${project.id} | Status: ${project.status}`,
      project,
    })),
    {
      label: '$(add) Create New Project',
      description: 'Create and select a new project',
      action: 'create' as const,
    },
  ];

  const selection = await vscode.window.showQuickPick<ProjectQuickPickItem>(quickPickItems, {
    placeHolder: 'Select one OCTOPUS project',
  });

  if (!selection) {
    return null;
  }

  if (selection.action === 'create') {
    return createProjectFromPrompt(options.sessionCookie, options.workspaceName);
  }

  return selection.project ?? null;
}

async function createProjectFromPrompt(sessionCookie: string, suggestedName: string): Promise<Project | null> {
  const name = await vscode.window.showInputBox({
    prompt: 'Project name',
    value: suggestedName,
    ignoreFocusOut: true,
    validateInput(value) {
      if (!value.trim()) {
        return 'Project name is required';
      }

      return null;
    },
  });

  if (!name) {
    return null;
  }

  const description = await vscode.window.showInputBox({
    prompt: 'Description (optional)',
    ignoreFocusOut: true,
  });

  const created = await createProject({
    cookie: sessionCookie,
    timeoutMs: getRequestTimeoutMs(),
    name: name.trim(),
    ...(description?.trim() ? { description: description.trim() } : {}),
  });

  return created.project;
}
