import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
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
import { logger } from '../logging';
import type { ExtensionViewState } from '../state';
import { ensureProjectSelection, rememberProjectId } from '../projects/selection';
import { packageWorkspaceAsZip, cleanupTemporaryArchive } from './archive';
import { createExclusionMatcher } from './exclusions';
import { getWorkspaceRoots, getWorkspaceSessionKey } from './workspace-detection';
import { scanWorkspace } from './workspace-scan';

const EXCLUDED_PATH_LOG_SAMPLE = 20;

function isCancellationError(error: unknown) {
  return error instanceof Error && error.name === 'CaptureCancelledError';
}

function throwIfCancelled(cancellationToken: vscode.CancellationToken) {
  if (cancellationToken.isCancellationRequested) {
    const error = new Error('Capture cancelled');
    error.name = 'CaptureCancelledError';
    throw error;
  }
}

function showErrorWithLogs(message: string) {
  void Promise.resolve(vscode.window.showErrorMessage(message, 'Show Logs')).then((choice) => {
    if (choice === 'Show Logs') {
      logger.show();
    }
  }, () => undefined);
}

export async function runSnapshotCapture(options: {
  context: vscode.ExtensionContext;
  updateView: (updater: (state: ExtensionViewState) => ExtensionViewState) => void;
}) {
  const roots = getWorkspaceRoots();
  const captureId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  if (roots.length === 0) {
    logger.warn('Capture aborted: no workspace folders open', { captureId });
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
      let stage = 'preparing';

      try {
        const extensionVersion =
          (options.context as unknown as { extension?: { packageJSON?: { version?: string } } }).extension
            ?.packageJSON?.version ?? '0.1.0';

        logger.info('Capture started', {
          captureId,
          extensionVersion,
          maxUploadBytes: getCaptureMaxUploadBytes(),
          maxTotalBytes: getCaptureMaxTotalBytes(),
          maxFiles: getCaptureMaxFiles(),
          maxDirectories: getCaptureMaxDirectories(),
          requestTimeoutMs: getRequestTimeoutMs(),
        });
        logger.info('Workspace folders detected', {
          captureId,
          count: roots.length,
          folders: roots.map((root) => ({ name: root.name, path: root.fsPath })),
        });

        progress.report({ message: 'Preparing workspace...' });

        stage = 'authentication';
        const sessionCookie = await ensureAuthenticatedSession(options.context, cancellationToken, (message) =>
          progress.report({ message }),
        );
        throwIfCancelled(cancellationToken);
        if (!sessionCookie) {
          logger.info('Capture stopped: not authenticated', { captureId, durationMs: elapsed() });
          return;
        }

        stage = 'project-selection';
        progress.report({ message: 'Loading OCTOPUS projects...' });
        const workspaceKey = getWorkspaceSessionKey(roots);
        const selectedProject = await ensureProjectSelection({
          context: options.context,
          sessionCookie,
          workspaceKey,
          workspaceName: roots[0]?.name ?? 'Workspace',
          cancellationToken,
          onStatus: (message) => progress.report({ message }),
        });
        throwIfCancelled(cancellationToken);

        if (!selectedProject) {
          logger.info('Capture stopped: no project selected', { captureId, durationMs: elapsed() });
          vscode.window.showInformationMessage(
            'Select or create an OCTOPUS project to continue snapshot capture.',
          );
          return;
        }

        logger.info('Project selected', { captureId, projectId: selectedProject.id, projectName: selectedProject.name });
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

        stage = 'scan';
        progress.report({ message: 'Scanning files...' });
        const scanStartedAt = Date.now();

        const scanResult = await scanWorkspace({
          roots,
          exclusionMatcher,
          maxFiles: getCaptureMaxFiles(),
          maxDirectories: getCaptureMaxDirectories(),
          maxTotalBytes: getCaptureMaxTotalBytes(),
          cancellationToken,
          onProgress(scanProgress) {
            progress.report({
              message: `Scanning files... ${scanProgress.filesDiscovered} files, ${scanProgress.directoriesScanned} folders`,
            });
          },
        });
        throwIfCancelled(cancellationToken);

        logger.info('Files discovered', {
          captureId,
          fileCount: scanResult.fileCount,
          directoryCount: scanResult.directoryCount,
          totalSizeBytes: scanResult.totalSizeBytes,
          durationMs: Date.now() - scanStartedAt,
        });
        logger.info('Files excluded', {
          captureId,
          excludedCount: scanResult.excludedPaths.length,
          sample: scanResult.excludedPaths.slice(0, EXCLUDED_PATH_LOG_SAMPLE),
        });
        if (scanResult.skippedUnreadablePaths.length > 0) {
          logger.warn('Unreadable paths skipped', {
            captureId,
            count: scanResult.skippedUnreadablePaths.length,
            sample: scanResult.skippedUnreadablePaths.slice(0, EXCLUDED_PATH_LOG_SAMPLE),
          });
        }

        if (scanResult.files.length === 0) {
          logger.warn('Capture stopped: no files left after exclusions', { captureId, durationMs: elapsed() });
          vscode.window.showWarningMessage('No files available to capture after exclusions.');
          return;
        }

        stage = 'packaging';
        progress.report({ message: 'Packaging project...' });
        const packageStartedAt = Date.now();
        let lastPackagingPercent = -1;

        const archive = await packageWorkspaceAsZip({
          files: scanResult.files,
          cancellationToken,
          onProgress(archiveProgress) {
            const percent =
              archiveProgress.totalBytes > 0
                ? Math.min(100, Math.floor((archiveProgress.processedBytes / archiveProgress.totalBytes) * 100))
                : 0;
            if (percent === lastPackagingPercent) {
              return;
            }
            lastPackagingPercent = percent;
            progress.report({
              message: `Packaging project... ${archiveProgress.processedEntries}/${archiveProgress.totalEntries} files (${percent}%)`,
            });
          },
        });

        tempDir = archive.tempDir;
        throwIfCancelled(cancellationToken);

        logger.info('Files packaged', {
          captureId,
          entryCount: archive.entryCount ?? scanResult.files.length,
          durationMs: Date.now() - packageStartedAt,
        });
        if (archive.warnings && archive.warnings.length > 0) {
          logger.warn('Archive warnings', { captureId, warnings: archive.warnings.slice(0, EXCLUDED_PATH_LOG_SAMPLE) });
        }

        const maxUploadBytes = getCaptureMaxUploadBytes();
        logger.info('Archive size', { captureId, sizeBytes: archive.sizeBytes, maxUploadBytes });
        if (archive.sizeBytes > maxUploadBytes) {
          throw new Error(`Project archive is too large (${archive.sizeBytes} bytes). Limit: ${maxUploadBytes} bytes.`);
        }

        stage = 'upload';
        progress.report({ message: 'Uploading snapshot... 0%' });
        const uploadStartedAt = Date.now();
        logger.info('Upload started', { captureId, projectId: selectedProject.id, sizeBytes: archive.sizeBytes });

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
            sizeBytes: archive.sizeBytes,
          },
        };

        let lastUploadPercent = -1;
        const snapshotResponse = await createSnapshot({
          projectId: selectedProject.id,
          cookie: sessionCookie,
          timeoutMs: getRequestTimeoutMs(),
          payload: snapshotPayload,
          archivePath: archive.archivePath,
          cancellationToken,
          onUploadProgress(sentBytes, totalBytes) {
            const percentage = totalBytes > 0 ? Math.min(100, Math.floor((sentBytes / totalBytes) * 100)) : 100;
            if (percentage === lastUploadPercent) {
              return;
            }
            lastUploadPercent = percentage;
            progress.report({ message: `Uploading snapshot... ${percentage}%` });
          },
        });

        logger.info('Upload completed', {
          captureId,
          snapshotId: snapshotResponse.snapshot.id,
          durationMs: Date.now() - uploadStartedAt,
        });

        progress.report({ message: 'Snapshot saved successfully.' });
        logger.info('Capture completed', {
          captureId,
          snapshotId: snapshotResponse.snapshot.id,
          durationMs: elapsed(),
        });

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
        if (cancellationToken.isCancellationRequested || isCancellationError(error)) {
          logger.info('Capture cancelled', { captureId, stage, durationMs: elapsed() });
          vscode.window.showInformationMessage('OCTOPUS snapshot capture cancelled.');
          return;
        }

        logger.error('Capture failed', error, { captureId, stage, durationMs: elapsed() });

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
            showErrorWithLogs('OCTOPUS server error while creating snapshot. Please retry.');
            return;
          }

          showErrorWithLogs(`Snapshot failed: ${error.message}`);
          return;
        }

        const message = error instanceof Error ? error.message : 'Unexpected snapshot capture failure';
        showErrorWithLogs(`Snapshot failed: ${message}`);
      } finally {
        if (tempDir) {
          await cleanupTemporaryArchive(tempDir);
        }
        logger.info('Capture finished', { captureId, stage, durationMs: elapsed() });
      }
    },
  );
}

async function ensureAuthenticatedSession(
  context: vscode.ExtensionContext,
  cancellationToken: vscode.CancellationToken,
  reportStatus: (message: string) => void,
): Promise<string | null> {
  const timeoutMs = getRequestTimeoutMs();
  const storedCookie = await getSessionCookie(context);

  if (storedCookie) {
    reportStatus('Checking OCTOPUS session...');
    const checkStartedAt = Date.now();
    try {
      await me({ cookie: storedCookie, timeoutMs, cancellationToken });
      logger.info('Session verified', { durationMs: Date.now() - checkStartedAt });
      return storedCookie;
    } catch (error) {
      throwIfCancelled(cancellationToken);

      if (!(error instanceof OctopusApiError) || (error.statusCode !== 401 && error.statusCode !== 403)) {
        // Network/timeout/server failures should surface instead of silently forcing a re-login.
        logger.error('Session check failed', error, { durationMs: Date.now() - checkStartedAt });
        throw error;
      }

      logger.warn('Stored session rejected; clearing cookie', { durationMs: Date.now() - checkStartedAt });
      await clearSessionCookie(context);
    }
  }

  throwIfCancelled(cancellationToken);

  reportStatus('Waiting for sign-in...');
  logger.info('Prompting for OCTOPUS sign-in');
  const connectNow = await vscode.window.showInformationMessage(
    'Connect your OCTOPUS account to create snapshots from VS Code.',
    { modal: true },
    'Connect',
  );

  if (connectNow !== 'Connect') {
    logger.info('Sign-in declined');
    return null;
  }

  const emailOrUsername = await vscode.window.showInputBox(
    {
      prompt: 'Email or username',
      ignoreFocusOut: true,
      validateInput(value) {
        return value.trim().length < 3 ? 'Enter a valid email or username' : null;
      },
    },
    cancellationToken,
  );

  if (!emailOrUsername) {
    return null;
  }

  const password = await vscode.window.showInputBox(
    {
      prompt: 'Password',
      password: true,
      ignoreFocusOut: true,
      validateInput(value) {
        return value.length < 1 ? 'Password is required' : null;
      },
    },
    cancellationToken,
  );

  if (!password) {
    return null;
  }

  throwIfCancelled(cancellationToken);
  reportStatus('Signing in to OCTOPUS...');

  const loginResult = await login({
    emailOrUsername,
    password,
    timeoutMs,
    cancellationToken,
  });

  const sessionCookie = extractSessionCookie(loginResult.headers.get('set-cookie'));
  if (!sessionCookie) {
    throw new Error('Authentication response missing session cookie');
  }

  await saveSessionCookie(context, sessionCookie);
  logger.info('Signed in to OCTOPUS');
  return sessionCookie;
}
