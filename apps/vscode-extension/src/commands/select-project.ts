import * as vscode from 'vscode';

import { me } from '../api/auth';
import { OctopusApiError } from '../api/types';
import { clearSessionCookie, getSessionCookie } from '../auth/session';
import { getRequestTimeoutMs } from '../config';
import { ensureProjectSelection, rememberProjectId } from '../projects/selection';
import type { ExtensionViewState } from '../state';
import { getWorkspaceRoots, getWorkspaceSessionKey } from '../capture/workspace-detection';

export async function selectOctopusProject(options: {
  context: vscode.ExtensionContext;
  updateView: (updater: (state: ExtensionViewState) => ExtensionViewState) => void;
}) {
  const roots = getWorkspaceRoots();
  if (roots.length === 0) {
    vscode.window.showWarningMessage(
      'Open a project/workspace in VS Code before selecting an OCTOPUS project.',
    );
    return;
  }

  const sessionCookie = await getSessionCookie(options.context);
  if (!sessionCookie) {
    vscode.window.showWarningMessage('Connect your OCTOPUS account first.');
    return;
  }

  try {
    await me({ cookie: sessionCookie, timeoutMs: getRequestTimeoutMs() });

    const workspaceKey = getWorkspaceSessionKey(roots);
    const selected = await ensureProjectSelection({
      context: options.context,
      sessionCookie,
      workspaceKey,
      workspaceName: roots[0]?.name ?? 'Workspace',
      forcePromptSelection: true,
    });

    if (!selected) {
      vscode.window.showInformationMessage('No OCTOPUS project selected.');
      return;
    }

    await rememberProjectId(options.context, workspaceKey, selected.id);
    options.updateView((state) => ({
      ...state,
      selectedProject: selected,
    }));

    vscode.window.showInformationMessage(`Selected project: ${selected.name}`);
  } catch (error) {
    if (error instanceof OctopusApiError) {
      if (error.statusCode === 401) {
        await clearSessionCookie(options.context);
        vscode.window.showWarningMessage('Authentication expired. Reconnect your OCTOPUS account and try again.');
        return;
      }

      if (error.statusCode === 429) {
        vscode.window.showWarningMessage('OCTOPUS rate limit reached. Please retry shortly.');
        return;
      }

      if (error.statusCode >= 500) {
        vscode.window.showErrorMessage('OCTOPUS server error while loading projects. Please retry.');
        return;
      }

      vscode.window.showErrorMessage(`Project selection failed: ${error.message}`);
      return;
    }

    const message = error instanceof Error ? error.message : 'Unexpected project selection failure';
    vscode.window.showErrorMessage(`Project selection failed: ${message}`);
  }
}
