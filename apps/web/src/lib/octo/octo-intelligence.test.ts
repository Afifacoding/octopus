import { describe, expect, it } from 'vitest';

import type { OctoSnapshotComparison } from './octo-client';
import {
  buildCompareSnapshotOptions,
  defaultComparePair,
  describeFileSizeChange,
  formatSignedBytes,
  hiddenFileCount,
} from './octo-intelligence';

const snapshotsNewestFirst = [
  { id: 'snap-c', createdAt: '2026-03-03T10:00:00.000Z' },
  { id: 'snap-b', createdAt: '2026-03-02T10:00:00.000Z' },
  { id: 'snap-a', createdAt: '2026-03-01T10:00:00.000Z' },
];

describe('buildCompareSnapshotOptions', () => {
  it('numbers snapshots oldest-first like the backend and lists them newest-first', () => {
    const options = buildCompareSnapshotOptions(snapshotsNewestFirst);

    expect(options.map((option) => [option.id, option.number])).toEqual([
      ['snap-c', 3],
      ['snap-b', 2],
      ['snap-a', 1],
    ]);
    expect(options[0]?.label.startsWith('#3 · ')).toBe(true);
  });

  it('does not depend on input order', () => {
    const shuffled = [snapshotsNewestFirst[1]!, snapshotsNewestFirst[2]!, snapshotsNewestFirst[0]!];
    expect(buildCompareSnapshotOptions(shuffled).map((option) => option.id)).toEqual(['snap-c', 'snap-b', 'snap-a']);
  });
});

describe('defaultComparePair', () => {
  it('compares the previous snapshot with the latest one', () => {
    expect(defaultComparePair(buildCompareSnapshotOptions(snapshotsNewestFirst))).toEqual({
      baseSnapshotId: 'snap-b',
      targetSnapshotId: 'snap-c',
    });
  });

  it('returns null when fewer than two snapshots exist', () => {
    expect(defaultComparePair(buildCompareSnapshotOptions(snapshotsNewestFirst.slice(0, 1)))).toBeNull();
    expect(defaultComparePair([])).toBeNull();
  });
});

describe('formatting helpers', () => {
  it('formats signed size deltas', () => {
    expect(formatSignedBytes(0)).toBe('±0 B');
    expect(formatSignedBytes(2048)).toBe('+2 KB');
    expect(formatSignedBytes(-512)).toBe('−512 B');
  });

  it('describes per-file size changes by status', () => {
    const base = { path: 'a.ts', sensitive: false };
    expect(describeFileSizeChange({ ...base, status: 'ADDED', baseSizeBytes: null, targetSizeBytes: 10, sizeDeltaBytes: 10 })).toBe('10 B');
    expect(describeFileSizeChange({ ...base, status: 'DELETED', baseSizeBytes: 20, targetSizeBytes: null, sizeDeltaBytes: -20 })).toBe('20 B');
    expect(describeFileSizeChange({ ...base, status: 'MODIFIED', baseSizeBytes: 20, targetSizeBytes: 15, sizeDeltaBytes: -5 })).toBe('−5 B');
  });

  it('reports how many counted files were not listed', () => {
    const comparison = {
      summary: { added: 503, modified: 1, deleted: 0, unchanged: 0 },
      added: new Array(500).fill(null),
      modified: [{}],
      deleted: [],
      unchanged: [],
    } as unknown as OctoSnapshotComparison;

    expect(hiddenFileCount(comparison, 'added')).toBe(3);
    expect(hiddenFileCount(comparison, 'modified')).toBe(0);
  });
});
