import * as vscode from 'vscode';

import { createInitialViewState, type ExtensionViewState } from './state';
import { runSnapshotCapture } from './capture/save-snapshot';
import { connectOctopusAccount } from './commands/connect-account';
import { openOctopusWeb } from './commands/open-web';
import { selectOctopusProject } from './commands/select-project';
import { startHeartbeat, stopHeartbeat } from './auth/heartbeat';
import { WorkspaceItem, WorkspaceViewProvider } from './view/workspace-view';

export function activate(context: vscode.ExtensionContext) {
  let viewState: ExtensionViewState = createInitialViewState();

  const updateView = (updater: (state: ExtensionViewState) => ExtensionViewState) => {
    viewState = updater(viewState);
    viewProvider.refresh();
  };

  const viewProvider = new WorkspaceViewProvider(() => viewState);

  startHeartbeat(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider<WorkspaceItem>('octopus.workspaceView', viewProvider),
    { dispose: stopHeartbeat },
  );

  const openPanelCommand = vscode.commands.registerCommand('octopus.openControlPanel', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.octopus');
  });

  const saveSnapshotCommand = vscode.commands.registerCommand('octopus.saveSnapshot', async () => {
    await runSnapshotCapture({
      context,
      updateView,
    });
  });

  const connectAccountCommand = vscode.commands.registerCommand('octopus.connectAccount', async () => {
    await connectOctopusAccount({
      context,
      updateView,
    });
  });

  const selectProjectCommand = vscode.commands.registerCommand('octopus.selectProject', async () => {
    await selectOctopusProject({
      context,
      updateView,
    });
  });

  const openWebAppCommand = vscode.commands.registerCommand('octopus.openWebApp', async () => {
    await openOctopusWeb();
  });

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'octopus.saveSnapshot';
  statusBar.text = '$(cloud-upload) OCTOPUS Save Snapshot';
  statusBar.tooltip = 'Capture workspace and save OCTOPUS snapshot';
  statusBar.show();

  context.subscriptions.push(
    openPanelCommand,
    saveSnapshotCommand,
    connectAccountCommand,
    selectProjectCommand,
    openWebAppCommand,
    statusBar,
  );
}

export function deactivate() {
  stopHeartbeat();
}
