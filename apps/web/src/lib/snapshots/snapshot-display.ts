import type { SnapshotRecord } from './types';

type SnapshotOrderInput = Pick<SnapshotRecord, 'id' | 'createdAt'>;

function orderSnapshotsChronologically<T extends SnapshotOrderInput>(snapshots: T[]): T[] {
  return [...snapshots].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

export function buildSnapshotNumberMap(snapshots: SnapshotOrderInput[]): Map<string, number> {
  const numbers = new Map<string, number>();

  orderSnapshotsChronologically(snapshots).forEach((snapshot, index) => {
    numbers.set(snapshot.id, index + 1);
  });

  return numbers;
}

export function resolveSnapshotNumber(snapshots: SnapshotOrderInput[], snapshotId: string): number | null {
  return buildSnapshotNumberMap(snapshots).get(snapshotId) ?? null;
}

export function formatSnapshotTitle(snapshotNumber: number | null) {
  return snapshotNumber === null ? 'Snapshot' : `Snapshot ${snapshotNumber}`;
}

export function formatCaptureSource(captureSource: SnapshotRecord['captureSource']) {
  const labels: Record<SnapshotRecord['captureSource'], string> = {
    EXTENSION: 'Extension',
    WEB: 'Web',
    API: 'API',
  };

  return labels[captureSource] ?? captureSource;
}

export function formatArchiveSize(sizeBytes: number | null) {
  if (sizeBytes === null || Number.isNaN(sizeBytes) || sizeBytes < 0) {
    return 'Unknown';
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

export function formatSnapshotCreatedAt(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatSnapshotCount(count: number | null) {
  return count === null ? 'Unknown' : String(count);
}

export function resolveSnapshotFailureMessage(snapshot: Pick<SnapshotRecord, 'status' | 'failureReason'>) {
  if (snapshot.status !== 'FAILED') {
    return null;
  }

  return snapshot.failureReason ?? 'This snapshot failed to process. Try capturing a new snapshot.';
}
