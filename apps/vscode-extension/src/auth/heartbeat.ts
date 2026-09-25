import * as vscode from 'vscode';

import { me } from '../api/auth';
import { getRequestTimeoutMs } from '../config';
import { getSessionCookie } from './session';

const HEARTBEAT_INTERVAL_MS = 60_000;

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

async function pingHeartbeat(context: vscode.ExtensionContext): Promise<void> {
  const cookie = await getSessionCookie(context);
  if (!cookie) {
    return;
  }

  try {
    // Reuses the existing /auth/me endpoint: it authenticates via the stored session
    // cookie and updates AuthSession.lastSeenAt as a side effect, with no new backend
    // surface and no workspace/secret data ever leaving the machine.
    await me({ cookie, timeoutMs: getRequestTimeoutMs() });
  } catch {
    // Heartbeat failures are expected when offline or logged out - the Dashboard will
    // show Not Connected once the freshness window elapses, so nothing to do here.
  }
}

export function startHeartbeat(context: vscode.ExtensionContext): void {
  void pingHeartbeat(context);

  if (heartbeatTimer) {
    return;
  }

  heartbeatTimer = setInterval(() => {
    void pingHeartbeat(context);
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}
