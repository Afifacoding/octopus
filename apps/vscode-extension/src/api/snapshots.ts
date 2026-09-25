import type { SnapshotCreateRequest, SnapshotRecord } from '../contracts/snapshot';

import { octopusRequest } from './client';

export async function createSnapshot(options: {
  projectId: string;
  cookie: string;
  timeoutMs: number;
  payload: SnapshotCreateRequest;
}) {
  return octopusRequest<{ snapshot: SnapshotRecord }>(`/projects/${options.projectId}/snapshots`, {
    method: 'POST',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
    body: options.payload,
  });
}
