import { HttpError } from '../../core/errors/http-error.js';
import type { SnapshotStatus } from './snapshots.types.js';

const allowedTransitions: Record<SnapshotStatus, SnapshotStatus[]> = {
  PENDING: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function assertSnapshotTransition(from: SnapshotStatus, to: SnapshotStatus) {
  if (!allowedTransitions[from].includes(to)) {
    throw new HttpError(409, 'SNAPSHOT_INVALID_STATUS_TRANSITION', `Invalid status transition ${from} -> ${to}`);
  }
}
