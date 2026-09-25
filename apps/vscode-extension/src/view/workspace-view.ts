import * as vscode from 'vscode';

import type { ExtensionViewState } from '../state';

export class WorkspaceItem extends vscode.TreeItem {
  constructor(label: string, description?: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (description) {
      this.description = description;
    }

    if (command) {
      this.command = command;
    }
  }
}

export class WorkspaceViewProvider implements vscode.TreeDataProvider<WorkspaceItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<WorkspaceItem | undefined | null>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly getState: () => ExtensionViewState) {}

  refresh() {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: WorkspaceItem): vscode.TreeItem {
    return element;
  }

  getChildren(): WorkspaceItem[] {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const workspaceName = workspaceFolders.length > 0 ? workspaceFolders.map((item) => item.name).join(', ') : 'No workspace open';
    const state = this.getState();

    const exclusionPreview = state.exclusionPreview.length > 0 ? state.exclusionPreview.join(', ') : 'No capture run yet';

    return [
      new WorkspaceItem('Save Snapshot', 'Capture workspace and upload', {
        title: 'Save Snapshot',
        command: 'octopus.saveSnapshot',
      }),
      new WorkspaceItem('Connect Account', state.connectedUser ?? 'Not connected', {
        title: 'Connect OCTOPUS Account',
        command: 'octopus.connectAccount',
      }),
      new WorkspaceItem('Select Project', state.selectedProject?.name ?? 'No project selected', {
        title: 'Select Project',
        command: 'octopus.selectProject',
      }),
      new WorkspaceItem('Active workspace', workspaceName),
      new WorkspaceItem('Last capture', state.lastCaptureSummary ?? 'No snapshot captured yet'),
      new WorkspaceItem('Exclusions', exclusionPreview),
      new WorkspaceItem('Open OCTOPUS Web App', 'Manage snapshots and project workspace', {
        title: 'Open OCTOPUS Web App',
        command: 'octopus.openWebApp',
      }),
    ];
  }
}
