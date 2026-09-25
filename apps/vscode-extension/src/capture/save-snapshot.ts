import * as vscode from 'vscode';
import type { SnapshotCreateRequest } from '../contracts/snapshot';

import { login, me } from '../api/auth';
import { createSnapshot } from '../api/snapshots';
import { OctopusApiError } from '../api/types';
import { extractSessionCookie } from '../auth/cookie';
import { clearSessionCookie, getSessionCookie, saveSessionCookie } from '../auth/session';
import {
  getCaptureExcludePatterns,
  getCaptureExcludeSensitiveFiles,
  getCaptureAnalyzeSecrets,
  getCaptureMaxDirectories,
  getCaptureMaxFiles,
  getCaptureMaxTotalBytes,
  getCaptureMaxUploadBytes,
  getRequestTimeoutMs,
  getWebBaseUrl,
} from '../config';
import type { ExtensionViewState } from '../state';
import { ensureProjectSelection, rememberProjectId } from '../projects/selection';
import { packageWorkspaceAsZip, cleanupTemporaryArchive } from './archive';
import { createExclusionMatcher } from './exclusions';
import { getWorkspaceRoots, getWorkspaceSessionKey } from './workspace-detection';
import { scanWorkspace } from './workspace-scan';

export async function runSnapshotCapture(options: {
  context: vscode.ExtensionContext;
  updateView: (updater: (state: ExtensionViewState) => ExtensionViewState) => void;
}) {
  const roots = getWorkspaceRoots();

  if (roots.length === 0) {
    vscode.window.showWarningMessage(
      'Open a project/workspace in VS Code before creating an OCTOPUS snapshot.',
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'OCTOPUS Snapshot Capture',
      cancellable: true,
    },
    async (progress, cancellationToken) => {
      let tempDir: string | null = null;

      try {
        const extensionVersion =
          (options.context as unknown as { extension?: { packageJSON?: { version?: string } } }).extension
            ?.packageJSON?.version ?? '0.1.0';

        progress.report({ message: 'Preparing workspace...' });

        const sessionCookie = await ensureAuthenticatedSession(options.context, cancellationToken);
        if (!sessionCookie) {
          return;
        }

        const workspaceKey = getWorkspaceSessionKey(roots);
        const selectedProject = await ensureProjectSelection({
          context: options.context,
          sessionCookie,
          workspaceKey,
          workspaceName: roots[0]?.name ?? 'Workspace',
        });

        if (!selectedProject) {
          vscode.window.showInformationMessage(
            'Select or create an OCTOPUS project to continue snapshot capture.',
          );
          return;
        }

        await rememberProjectId(options.context, workspaceKey, selectedProject.id);

        options.updateView((state) => ({
          ...state,
          selectedProject,
        }));

        const exclusionMatcher = createExclusionMatcher({
          customPatterns: getCaptureExcludePatterns(),
          excludeSensitiveFiles: getCaptureExcludeSensitiveFiles(),
        });

        options.updateView((state) => ({
          ...state,
          exclusionPreview: exclusionMatcher.activePatterns.slice(0, 8),
        }));

        progress.report({ message: 'Scanning files...' });

        const scanResult = await scanWorkspace({
          roots,
          exclusionMatcher,
          maxFiles: getCaptureMaxFiles(),
          maxDirectories: getCaptureMaxDirectories(),
          maxTotalBytes: getCaptureMaxTotalBytes(),
          cancellationToken,
        });

        if (scanResult.files.length === 0) {
          vscode.window.showWarningMessage('No files available to capture after exclusions.');
          return;
        }

        progress.report({ message: 'Packaging project...' });

        const archive = await packageWorkspaceAsZip({
          files: scanResult.files,
          cancellationToken,
        });

        tempDir = archive.tempDir;

        const maxUploadBytes = getCaptureMaxUploadBytes();
        if (archive.sizeBytes > maxUploadBytes) {
          throw new Error(`Project archive is too large (${archive.sizeBytes} bytes). Limit: ${maxUploadBytes} bytes.`);
        }

        progress.report({ message: 'Uploading snapshot...' });

        const snapshotPayload: SnapshotCreateRequest = {
          captureSource: 'EXTENSION',
          clientName: 'octopus-vscode-extension',
          clientVersion: extensionVersion,
          fileCount: scanResult.fileCount,
          directoryCount: scanResult.directoryCount,
          metadata: {
            workspaceRoots: roots.map((root) => root.name),
            excludedCount: scanResult.excludedPaths.length,
            skippedUnreadableCount: scanResult.skippedUnreadablePaths.length,
            analyzeSecrets: getCaptureAnalyzeSecrets(),
          },
          archive: {
            fileName: 'workspace.zip',
            contentType: 'application/zip',
            base64Data: archive.base64Data,
            sizeBytes: archive.sizeBytes,
          },
          entries: scanResult.entries,
        };

        const snapshotResponse = await createSnapshot({
          projectId: selectedProject.id,
          cookie: sessionCookie,
          timeoutMs: getRequestTimeoutMs(),
          payload: snapshotPayload,
        });

        progress.report({ message: 'Snapshot saved successfully.' });

        const summary = `Project ${selectedProject.name} | Snapshot ${snapshotResponse.snapshot.id} | Files ${scanResult.fileCount}`;
        options.updateView((state) => ({
          ...state,
          lastCaptureSummary: summary,
        }));

        const openChoice = await vscode.window.showInformationMessage(
          `Snapshot saved successfully. Project: ${selectedProject.name}, Snapshot: ${snapshotResponse.snapshot.id}`,
          'Open in OCTOPUS',
        );

        if (openChoice === 'Open in OCTOPUS') {
          const webUrl = `${getWebBaseUrl().replace(/\/$/u, '')}/projects/${selectedProject.id}/snapshots/${snapshotResponse.snapshot.id}`;
          await vscode.env.openExternal(vscode.Uri.parse(webUrl));
        }
      } catch (error) {
        if (cancellationToken.isCancellationRequested) {
          vscode.window.showInformationMessage('OCTOPUS snapshot capture cancelled.');
          return;
        }

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
            vscode.window.showErrorMessage('OCTOPUS server error while creating snapshot. Please retry.');
            return;
          }

          vscode.window.showErrorMessage(`Snapshot failed: ${error.message}`);
          return;
        }

        const message = error instanceof Error ? error.message : 'Unexpected snapshot capture failure';
        vscode.window.showErrorMessage(`Snapshot failed: ${message}`);
      } finally {
        if (tempDir) {
          await cleanupTemporaryArchive(tempDir);
        }
      }
    },
  );
}

async function ensureAuthenticatedSession(
  context: vscode.ExtensionContext,
  cancellationToken: vscode.CancellationToken,
): Promise<string | null> {
  const timeoutMs = getRequestTimeoutMs();
  const storedCookie = await getSessionCookie(context);

  if (storedCookie) {
    try {
      await me({ cookie: storedCookie, timeoutMs });
      return storedCookie;
    } catch {
      await clearSessionCookie(context);
    }
  }

  if (cancellationToken.isCancellationRequested) {
    return null;
  }

  const connectNow = await vscode.window.showInformationMessage(
    'Connect your OCTOPUS account to create snapshots from VS Code.',
    'Connect',
    'Cancel',
  );

  if (connectNow !== 'Connect') {
    return null;
  }

  const emailOrUsername = await vscode.window.showInputBox({
    prompt: 'Email or username',
    ignoreFocusOut: true,
    validateInput(value) {
      return value.trim().length < 3 ? 'Enter a valid email or username' : null;
    },
  });

  if (!emailOrUsername) {
    return null;
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
    return null;
  }

  const loginResult = await login({
    emailOrUsername,
    password,
    timeoutMs,
  });

  const sessionCookie = extractSessionCookie(loginResult.headers.get('set-cookie'));
  if (!sessionCookie) {
    throw new Error('Authentication response missing session cookie');
  }

  await saveSessionCookie(context, sessionCookie);
  return sessionCookie;
}
