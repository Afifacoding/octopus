import { afterEach, describe, expect, it, vi } from 'vitest';

import * as vscode from 'vscode';

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
    mocks.createSnapshot.mockRejectedValueOnce(new Error('cancelled'));

    vi.spyOn(vscode.window, 'withProgress').mockImplementationOnce(async (_options, task) => {
      await task({ report: () => undefined }, { isCancellationRequested: true } as never);
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

    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Project archive is too large'));
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
    expect((callArgs?.payload as any)?.archive?.sizeBytes).toBe(nearLimitBytes);
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

    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Project archive is too large'));
    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.cleanupTemporaryArchive).toHaveBeenCalledWith('oversized-temp-dir');
  });
});
