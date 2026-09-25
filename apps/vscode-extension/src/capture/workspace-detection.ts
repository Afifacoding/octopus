import * as vscode from 'vscode';

import type { CaptureRoot } from './types';

export function mapWorkspaceFolders(
  folders: Array<{ name: string; uri: { fsPath: string } }> | undefined,
): CaptureRoot[] {
  return (folders ?? []).map((folder) => ({
    name: folder.name,
    fsPath: folder.uri.fsPath,
  }));
}

export function getWorkspaceRoots(): CaptureRoot[] {
  return mapWorkspaceFolders(vscode.workspace.workspaceFolders);
}

export function getWorkspaceSessionKey(roots: CaptureRoot[]) {
  return roots.map((root) => `${root.name}:${root.fsPath}`).sort().join('|');
}
