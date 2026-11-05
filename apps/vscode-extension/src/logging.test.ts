import { afterEach, describe, expect, it, vi } from 'vitest';

import * as vscode from 'vscode';

import { initializeLogging, logger } from './logging';

type MockWindow = { createOutputChannel?: unknown };

const disposables: Array<{ dispose(): unknown }> = [];

afterEach(() => {
  // Disposing resets the cached channel so each test gets a fresh one.
  for (const disposable of disposables.splice(0)) {
    disposable.dispose();
  }
  delete (vscode.window as MockWindow).createOutputChannel;
});

function installChannel() {
  const lines: string[] = [];
  const channel = { appendLine: vi.fn((line: string) => lines.push(line)), show: vi.fn(), dispose: vi.fn() };
  const createOutputChannel = vi.fn(() => channel);
  (vscode.window as MockWindow).createOutputChannel = createOutputChannel;
  initializeLogging({ subscriptions: disposables } as unknown as vscode.ExtensionContext);
  return { lines, channel, createOutputChannel };
}

describe('OCTOPUS Ghost logging', () => {
  it('writes structured lines to the "OCTOPUS Ghost" output channel', () => {
    const { lines, createOutputChannel } = installChannel();

    logger.info('Capture started', { captureId: 'abc', fileCount: 3 });
    logger.warn('Files excluded', { excludedCount: 2 });

    expect(createOutputChannel).toHaveBeenCalledWith('OCTOPUS Ghost');
    expect(lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\] \[INFO\] Capture started \{"captureId":"abc","fileCount":3\}$/u);
    expect(lines[1]).toContain('[WARN] Files excluded {"excludedCount":2}');
  });

  it('logs exact error messages and full stack traces', () => {
    const { lines, channel } = installChannel();
    const error = new Error('Request timed out after 120000ms');

    logger.error('Capture failed', error, { stage: 'authentication' });
    logger.show();

    expect(lines[0]).toContain('[ERROR] Capture failed');
    expect(lines[0]).toContain('"stage":"authentication"');
    expect(lines[0]).toContain('"message":"Request timed out after 120000ms"');
    expect(lines[1]).toBe(error.stack);
    expect(channel.show).toHaveBeenCalled();
  });

  it('is a safe no-op when no output channel API is available', () => {
    expect(() => logger.error('Capture failed', new Error('boom'))).not.toThrow();
    expect(() => logger.show()).not.toThrow();
  });
});
