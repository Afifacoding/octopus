import { afterEach, describe, expect, it, vi } from 'vitest';

import * as vscode from 'vscode';

import { OctopusApiError } from '../api/types';
import { runSnapshotCapture } from './save-snapshot';

const mocks = vi.hoisted(() => ({
  me: vi.fn(async () => ({ user: { id: 'user_1' } })),
  login: vi.fn(),
  createSnapshot: vi.fn(async (options: {
    projectId: string;
    cookie: string;
    timeoutMs: number;
    payload: unknown;
    archivePath: string;
    onUploadProgress?: (sentBytes: number, totalBytes: number) => void;
  }) => ({ snapshot: { id: 'snapshot_1' }, options })),
  getSessionCookie: vi.fn(async () => 'session-cookie'),
  clearSessionCookie: vi.fn(async () => undefined),
  saveSessionCookie: vi.fn(async () => undefined),
  ensureProjectSelection: vi.fn(async () => ({ id: 'project_1', name: 'Project 1' })),
  rememberProjectId: vi.fn(async () => undefined),
  packageWorkspaceAsZip: vi.fn(async () => ({
    archivePath: 'archive.zip',
    tempDir: 'temp-dir',
    sizeBytes: 100,
  })),
  cleanupTemporaryArchive: vi.fn(async () => undefined),
  scanWorkspace: vi.fn(async () => ({
    files: [{ absolutePath: 'a.ts', relativePath: 'workspace/a.ts', sizeBytes: 1 }],
    fileCount: 1,
    directoryCount: 0,
    totalSizeBytes: 1,
    excludedPaths: [],
    skippedUnreadablePaths: [],
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    show: vi.fn(),
  },
}));

vi.mock('../logging', () => ({
  logger: mocks.logger,
}));

vi.mock('../api/auth', () => ({
  me: mocks.me,
  login: mocks.login,
}));

vi.mock('../api/snapshots', () => ({
  createSnapshot: mocks.createSnapshot,
}));

vi.mock('../auth/session', () => ({
  getSessionCookie: mocks.getSessionCookie,
  clearSessionCookie: mocks.clearSessionCookie,
  saveSessionCookie: mocks.saveSessionCookie,
}));

vi.mock('../projects/selection', () => ({
  ensureProjectSelection: mocks.ensureProjectSelection,
  rememberProjectId: mocks.rememberProjectId,
}));

vi.mock('../config', () => ({
  getCaptureExcludePatterns: () => [],
  getCaptureExcludeSensitiveFiles: () => true,
  getCaptureAnalyzeSecrets: () => true,
  getCaptureMaxDirectories: () => 100,
  getCaptureMaxFiles: () => 100,
  getCaptureMaxTotalBytes: () => 150000000,
  getCaptureMaxUploadBytes: () => 31457280,
  getRequestTimeoutMs: () => 1000,
  getWebBaseUrl: () => 'http://localhost:5173',
}));

vi.mock('./archive', () => ({
  packageWorkspaceAsZip: mocks.packageWorkspaceAsZip,
  cleanupTemporaryArchive: mocks.cleanupTemporaryArchive,
}));

vi.mock('./workspace-detection', () => ({
  getWorkspaceRoots: () => [{ name: 'workspace', fsPath: 'workspace-path' }],
  getWorkspaceSessionKey: () => 'workspace-key',
}));

vi.mock('./workspace-scan', () => ({
  scanWorkspace: mocks.scanWorkspace,
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.cleanupTemporaryArchive.mockClear();
  mocks.createSnapshot.mockReset();
  mocks.createSnapshot.mockImplementation(async (options) => ({ snapshot: { id: 'snapshot_1' }, options }));
});

describe('runSnapshotCapture archive cleanup', () => {
  it('cleans up temporary archive after success', async () => {
    await runSnapshotCapture({
      context: {} as never,
      updateView: () => undefined,
    });

    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('temp-dir');
  });

  it('cleans up temporary archive after failure', async () => {
    mocks.createSnapshot.mockRejectedValueOnce(new Error('upload failed'));

    await runSnapshotCapture({
      context: {} as never,
      updateView: () => undefined,
    });

    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('temp-dir');
  });

  it('cleans up temporary archive after cancellation', async () => {
    const token = { isCancellationRequested: false };
    mocks.createSnapshot.mockImplementationOnce(async () => {
      token.isCancellationRequested = true;
      throw new Error('cancelled');
    });

    vi.spyOn(vscode.window, 'withProgress').mockImplementationOnce(async (_options, task) => {
      await task({ report: () => undefined }, token as never);
    });

    await runSnapshotCapture({
      context: {} as never,
      updateView: () => undefined,
    });

    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('temp-dir');
  });

  it('passes upload progress into the VS Code progress notification', async () => {
    const report = vi.fn();
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');
    vi.spyOn(vscode.window, 'withProgress').mockImplementationOnce(async (_progressOptions, task) =>
      task({ report }, { isCancellationRequested: false } as never) as never,
    );

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showError).not.toHaveBeenCalled();
    expect(mocks.createSnapshot).toHaveBeenCalledTimes(1);
    const requestOptions = mocks.createSnapshot.mock.calls[0]?.[0];
    expect(requestOptions?.archivePath).toBe('archive.zip');
    requestOptions?.onUploadProgress?.(50, 100);
    expect(report).toHaveBeenCalledWith({ message: 'Uploading snapshot... 50%' });
  });

  it('fails clearly and cleans the archive when the upload cap is exceeded', async () => {
    mocks.packageWorkspaceAsZip.mockResolvedValueOnce({
      archivePath: 'large-archive.zip',
      tempDir: 'large-temp-dir',
      sizeBytes: 31457280 + 1,
    });
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Project archive is too large'), 'Show Logs');
    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('large-temp-dir');
  });

  it('accepts archives larger than 700 KB (old limit)', async () => {
    mocks.packageWorkspaceAsZip.mockResolvedValueOnce({
      archivePath: 'large-archive.zip',
      tempDir: 'temp-dir',
      sizeBytes: 1.5 * 1024 * 1024,
    });
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showError).not.toHaveBeenCalled();
    expect(mocks.createSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('temp-dir');
  });

  it('accepts archives near 30 MiB limit', async () => {
    const nearLimitBytes = 30 * 1024 * 1024 - 1024;
    mocks.packageWorkspaceAsZip.mockResolvedValueOnce({
      archivePath: 'large-archive.zip',
      tempDir: 'temp-dir',
      sizeBytes: nearLimitBytes,
    });
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showError).not.toHaveBeenCalled();
    expect(mocks.createSnapshot).toHaveBeenCalledTimes(1);
    const callArgs = mocks.createSnapshot.mock.calls[0]?.[0];
    expect((callArgs?.payload as { archive?: { sizeBytes?: number } } | undefined)?.archive?.sizeBytes).toBe(nearLimitBytes);
    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('temp-dir');
  });

  it('rejects archives exceeding 30 MiB limit', async () => {
    mocks.packageWorkspaceAsZip.mockResolvedValueOnce({
      archivePath: 'oversized-archive.zip',
      tempDir: 'oversized-temp-dir',
      sizeBytes: 30 * 1024 * 1024 + 1,
    });
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Project archive is too large'), 'Show Logs');
    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('oversized-temp-dir');
  });
});

describe('runSnapshotCapture diagnostics, progress and cancellation', () => {
  afterEach(() => {
    mocks.logger.info.mockClear();
    mocks.logger.warn.mockClear();
    mocks.logger.error.mockClear();
    mocks.me.mockClear();
    mocks.ensureProjectSelection.mockClear();
    mocks.scanWorkspace.mockClear();
    mocks.packageWorkspaceAsZip.mockClear();
    mocks.clearSessionCookie.mockClear();
  });

  function loggedMessages(level: 'info' | 'warn' | 'error') {
    return mocks.logger[level].mock.calls.map((call) => call[0]);
  }

  it('logs each capture stage including archive size, upload and duration', async () => {
    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    const messages = loggedMessages('info');
    expect(messages).toEqual(
      expect.arrayContaining([
        'Capture started',
        'Workspace folders detected',
        'Files discovered',
        'Files excluded',
        'Files packaged',
        'Archive size',
        'Upload started',
        'Upload completed',
        'Capture completed',
      ]),
    );
    const completed = mocks.logger.info.mock.calls.find((call) => call[0] === 'Capture completed');
    expect(typeof (completed?.[1] as { durationMs?: unknown })?.durationMs).toBe('number');
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('passes the cancellation token to the session check and project selection', async () => {
    const token = { isCancellationRequested: false };
    vi.spyOn(vscode.window, 'withProgress').mockImplementationOnce(async (_options, task) =>
      task({ report: () => undefined }, token as never) as never,
    );

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(mocks.me).toHaveBeenCalledWith(expect.objectContaining({ cancellationToken: token }));
    expect(mocks.ensureProjectSelection).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationToken: token, onStatus: expect.any(Function) }),
    );
  });

  it('reports granular progress instead of staying on "Preparing workspace..."', async () => {
    const report = vi.fn();
    mocks.scanWorkspace.mockImplementationOnce((async (options: {
      onProgress?: (progress: { filesDiscovered: number; directoriesScanned: number }) => void;
    }) => {
      options.onProgress?.({ filesDiscovered: 1200, directoriesScanned: 87 });
      return {
        files: [{ absolutePath: 'a.ts', relativePath: 'workspace/a.ts', sizeBytes: 1 }],
        fileCount: 1,
        directoryCount: 0,
        totalSizeBytes: 1,
        excludedPaths: [],
        skippedUnreadablePaths: [],
      };
    }) as never);
    mocks.packageWorkspaceAsZip.mockImplementationOnce((async (options: {
      onProgress?: (progress: { processedEntries: number; totalEntries: number; processedBytes: number; totalBytes: number }) => void;
    }) => {
      options.onProgress?.({ processedEntries: 5, totalEntries: 10, processedBytes: 50, totalBytes: 100 });
      return { archivePath: 'archive.zip', tempDir: 'temp-dir', sizeBytes: 100 };
    }) as never);
    vi.spyOn(vscode.window, 'withProgress').mockImplementationOnce(async (_options, task) =>
      task({ report }, { isCancellationRequested: false } as never) as never,
    );

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    const messages = report.mock.calls.map((call) => call[0].message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'Preparing workspace...',
        'Checking OCTOPUS session...',
        'Loading OCTOPUS projects...',
        'Scanning files... 1200 files, 87 folders',
        'Packaging project... 5/10 files (50%)',
        'Snapshot saved successfully.',
      ]),
    );
  });

  it('stops cleanly when cancelled during project selection', async () => {
    const token = { isCancellationRequested: false };
    mocks.ensureProjectSelection.mockImplementationOnce(async () => {
      token.isCancellationRequested = true;
      return null as never;
    });
    const showInfo = vi.spyOn(vscode.window, 'showInformationMessage');
    vi.spyOn(vscode.window, 'withProgress').mockImplementationOnce(async (_options, task) =>
      task({ report: () => undefined }, token as never) as never,
    );

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showInfo).toHaveBeenCalledWith('OCTOPUS snapshot capture cancelled.');
    expect(mocks.scanWorkspace).not.toHaveBeenCalled();
    expect(mocks.packageWorkspaceAsZip).not.toHaveBeenCalled();
    expect(loggedMessages('info')).toContain('Capture cancelled');
  });

  it('treats a scan cancellation error as a cancellation, not a failure', async () => {
    const cancelled = new Error('Capture cancelled');
    cancelled.name = 'CaptureCancelledError';
    mocks.scanWorkspace.mockRejectedValueOnce(cancelled);
    const showInfo = vi.spyOn(vscode.window, 'showInformationMessage');
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showInfo).toHaveBeenCalledWith('OCTOPUS snapshot capture cancelled.');
    expect(showError).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('logs scan failures with the stage and the original error', async () => {
    const failure = new Error('Workspace size limit exceeded (200 bytes). Limit: 100 bytes.');
    mocks.scanWorkspace.mockRejectedValueOnce(failure);
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showError).toHaveBeenCalledWith(
      'Snapshot failed: Workspace size limit exceeded (200 bytes). Limit: 100 bytes.',
      'Show Logs',
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Capture failed',
      failure,
      expect.objectContaining({ stage: 'scan', durationMs: expect.any(Number) }),
    );
    expect(mocks.packageWorkspaceAsZip).not.toHaveBeenCalled();
  });

  it('surfaces session-check network failures instead of silently prompting for sign-in', async () => {
    const failure = new Error('Request timed out after 1000ms');
    mocks.me.mockRejectedValueOnce(failure);
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');
    const showInfo = vi.spyOn(vscode.window, 'showInformationMessage');

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(showError).toHaveBeenCalledWith('Snapshot failed: Request timed out after 1000ms', 'Show Logs');
    expect(showInfo).not.toHaveBeenCalledWith(expect.stringContaining('Connect your OCTOPUS account'), expect.anything(), 'Connect');
    expect(mocks.clearSessionCookie).not.toHaveBeenCalled();
    expect(mocks.ensureProjectSelection).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledWith('Session check failed', failure, expect.any(Object));
  });

  it('clears an expired session and shows a modal sign-in prompt', async () => {
    mocks.me.mockRejectedValueOnce(new OctopusApiError(401, 'UNAUTHORIZED', 'Unauthorized') as never);
    const showInfo = vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValueOnce(undefined as never);

    await runSnapshotCapture({ context: {} as never, updateView: () => undefined });

    expect(mocks.clearSessionCookie).toHaveBeenCalled();
    expect(showInfo).toHaveBeenCalledWith(
      'Connect your OCTOPUS account to create snapshots from VS Code.',
      { modal: true },
      'Connect',
    );
    expect(mocks.ensureProjectSelection).not.toHaveBeenCalled();
  });
});
