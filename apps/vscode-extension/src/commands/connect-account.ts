import * as vscode from 'vscode';

import { login } from '../api/auth';
import { OctopusApiError } from '../api/types';
import { extractSessionCookie } from '../auth/cookie';
import { startHeartbeat } from '../auth/heartbeat';
import { saveSessionCookie } from '../auth/session';
import { getRequestTimeoutMs } from '../config';
import { ensureProjectSelection, rememberProjectId } from '../projects/selection';
import type { ExtensionViewState } from '../state';
import { getWorkspaceRoots, getWorkspaceSessionKey } from '../capture/workspace-detection';

export async function connectOctopusAccount(options: {
  context: vscode.ExtensionContext;
  updateView: (updater: (state: ExtensionViewState) => ExtensionViewState) => void;
}) {
  const emailOrUsername = await vscode.window.showInputBox({
    prompt: 'Email or username',
    ignoreFocusOut: true,
    validateInput(value) {
      return value.trim().length < 3 ? 'Enter a valid email or username' : null;
    },
  });

  if (!emailOrUsername) {
    return;
  }

  const password = await vscode.window.showInputBox({
    prompt: 'Password',
    password: true,
    ignoreFocusOut: true,
    validateInput(value) {
      return value.length < 1 ? 'Password is required' : null;
    },
  });

  if (!password) {
    return;
  }

  try {
    const result = await login({
      emailOrUsername,
      password,
      timeoutMs: getRequestTimeoutMs(),
    });

    const sessionCookie = extractSessionCookie(result.headers.get('set-cookie'));
    if (!sessionCookie) {
      throw new Error('Authentication response missing session cookie');
    }

    await saveSessionCookie(options.context, sessionCookie);
    startHeartbeat(options.context);

    options.updateView((state) => ({
      ...state,
      connectedUser: result.data.user.email,
    }));

    vscode.window.showInformationMessage('OCTOPUS account connected successfully.');

    const roots = getWorkspaceRoots();
    if (roots.length > 0) {
      const workspaceKey = getWorkspaceSessionKey(roots);
      const selected = await ensureProjectSelection({
        context: options.context,
        sessionCookie,
        workspaceKey,
        workspaceName: roots[0]?.name ?? 'Workspace',
      });

      if (selected) {
        await rememberProjectId(options.context, workspaceKey, selected.id);
        options.updateView((state) => ({
          ...state,
          selectedProject: selected,
        }));
      }
    }
  } catch (error) {
    if (error instanceof OctopusApiError) {
      vscode.window.showErrorMessage(`Connection failed: ${error.message}`);
      return;
    }

    vscode.window.showErrorMessage('Failed to connect OCTOPUS account.');
  }
}
