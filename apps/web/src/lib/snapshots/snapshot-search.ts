import { buildSnapshotNumberMap, formatCaptureSource, formatSnapshotCreatedAt } from './snapshot-display';
import type { SnapshotRecord } from './types';

export type SnapshotSearchEntry = {
  snapshotId: string;
  projectId: string;
  projectName: string;
  snapshotNumber: number;
  label: string;
  status: SnapshotRecord['status'];
  captureSource: string;
  createdAtLabel: string;
  createdAt: string;
};

export function buildSnapshotSearchEntries(
  projects: Array<{ id: string; name: string }>,
  snapshotsByProjectId: Record<string, SnapshotRecord[]>,
): SnapshotSearchEntry[] {
  const entries: SnapshotSearchEntry[] = [];

  for (const project of projects) {
    const snapshots = snapshotsByProjectId[project.id] ?? [];
    const numbers = buildSnapshotNumberMap(snapshots);

    for (const snapshot of snapshots) {
      const snapshotNumber = numbers.get(snapshot.id) ?? 0;

      entries.push({
        snapshotId: snapshot.id,
        projectId: project.id,
        projectName: project.name,
        snapshotNumber,
        label: `Snapshot ${snapshotNumber}`,
        status: snapshot.status,
        captureSource: formatCaptureSource(snapshot.captureSource),
        createdAtLabel: formatSnapshotCreatedAt(snapshot.createdAt),
        createdAt: snapshot.createdAt,
      });
    }
  }

  return entries.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function filterSnapshotSearchEntries(
  entries: SnapshotSearchEntry[],
  query: string,
  limit = 8,
): SnapshotSearchEntry[] {
  const normalized = query.trim().toLowerCase();

  if (normalized.length === 0) {
    return [];
  }

  const terms = normalized.split(/\s+/);

  const matches = entries.filter((entry) => {
    const haystack = [
      entry.label,
      String(entry.snapshotNumber),
      entry.projectName,
      entry.captureSource,
      entry.status,
      entry.createdAtLabel,
    ]
      .join(' ')
      .toLowerCase();

    const tokens = haystack.split(/[^a-z0-9]+/).filter((token) => token.length > 0);

    // Numeric terms match whole tokens so "2" finds Snapshot 2 rather than every date in 2026.
    return terms.every((term) =>
      /^\d+$/.test(term) ? tokens.includes(term) : haystack.includes(term),
    );
  });

  return matches.slice(0, limit);
}
