import { buildSnapshotNumberMap, formatArchiveSize, formatSnapshotCreatedAt } from '../snapshots/snapshot-display';
import type { OctoComparisonFile, OctoSnapshotComparison } from './octo-client';

export type CompareSnapshotOption = {
  id: string;
  number: number;
  label: string;
};

/**
 * Completed snapshots numbered like the backend (#1 = oldest), listed newest first.
 */
export function buildCompareSnapshotOptions(snapshots: Array<{ id: string; createdAt: string }>): CompareSnapshotOption[] {
  const numbers = buildSnapshotNumberMap(snapshots);

  return snapshots
    .map((snapshot) => {
      const number = numbers.get(snapshot.id) ?? 0;
      return { id: snapshot.id, number, label: `#${number} · ${formatSnapshotCreatedAt(snapshot.createdAt)}` };
    })
    .sort((left, right) => right.number - left.number);
}

/** Defaults to comparing the previous snapshot (base) with the latest one (target). */
export function defaultComparePair(options: CompareSnapshotOption[]): { baseSnapshotId: string; targetSnapshotId: string } | null {
  const [latest, previous] = options;
  if (!latest || !previous) return null;
  return { baseSnapshotId: previous.id, targetSnapshotId: latest.id };
}

export function formatSignedBytes(deltaBytes: number): string {
  if (deltaBytes === 0) return '±0 B';
  const sign = deltaBytes > 0 ? '+' : '−';
  return `${sign}${formatArchiveSize(Math.abs(deltaBytes))}`;
}

export function formatSnapshotRef(ref: { sequence: number | null; createdAt: string }): string {
  const prefix = ref.sequence === null ? 'Snapshot' : `Snapshot #${ref.sequence}`;
  return `${prefix} · ${formatSnapshotCreatedAt(ref.createdAt)}`;
}

export type ComparisonCategory = 'added' | 'modified' | 'deleted' | 'unchanged';

export const COMPARISON_CATEGORIES: Array<{ key: ComparisonCategory; label: string }> = [
  { key: 'added', label: 'Added' },
  { key: 'modified', label: 'Modified' },
  { key: 'deleted', label: 'Deleted' },
  { key: 'unchanged', label: 'Unchanged' },
];

export function describeFileSizeChange(file: OctoComparisonFile): string {
  if (file.status === 'ADDED') return formatArchiveSize(file.targetSizeBytes);
  if (file.status === 'DELETED') return formatArchiveSize(file.baseSizeBytes);
  if (file.status === 'UNCHANGED') return formatArchiveSize(file.targetSizeBytes);
  return formatSignedBytes(file.sizeDeltaBytes);
}

/** Number of files in a category that the server counted but did not list. */
export function hiddenFileCount(comparison: OctoSnapshotComparison, category: ComparisonCategory): number {
  return Math.max(0, comparison.summary[category] - comparison[category].length);
}
