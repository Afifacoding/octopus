import { afterEach, describe, expect, it, vi } from 'vitest';

import * as vscode from 'vscode';

import { runSnapshotCapture } from './save-snapshot';

const mocks = vi.hoisted(() => ({
  me: vi.fn(async () => ({ user: { id: 'user_1' } })),
  login: vi.fn(),
  createSnapshot: vi.fn(async () => ({ snapshot: { id: 'snapshot_1' } })),
  getSessionCookie: vi.fn(async () => 'session-cookie'),
  clearSessionCookie: vi.fn(async () => undefined),
  saveSessionCookie: vi.fn(async () => undefined),
  ensureProjectSelection: vi.fn(async () => ({ id: 'project_1', name: 'Project 1' })),
  rememberProjectId: vi.fn(async () => undefined),
  packageWorkspaceAsZip: vi.fn(async () => ({
    archivePath: 'archive.zip',
    tempDir: 'temp-dir',
    sizeBytes: 100,
    base64Data: 'YQ==',
  })),
  cleanupTemporaryArchive: vi.fn(async () => undefined),
  scanWorkspace: vi.fn(async () => ({
    files: [{ absolutePath: 'a.ts', relativePath: 'workspace/a.ts', sizeBytes: 1 }],
    entries: [{ path: 'workspace/a.ts', type: 'FILE' }],
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
  getCaptureMaxDirectories: () => 100,
  getCaptureMaxFiles: () => 100,
  getCaptureMaxTotalBytes: () => 100000,
  getCaptureMaxUploadBytes: () => 100000,
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
  mocks.createSnapshot.mockResolvedValue({ snapshot: { id: 'snapshot_1' } });
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
});
