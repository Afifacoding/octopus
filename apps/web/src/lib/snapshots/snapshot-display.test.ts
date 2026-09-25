import { describe, expect, it } from 'vitest';

import {
  buildSnapshotNumberMap,
  formatArchiveSize,
  formatCaptureSource,
  formatSnapshotCount,
  formatSnapshotCreatedAt,
  formatSnapshotTitle,
  resolveSnapshotFailureMessage,
  resolveSnapshotNumber,
} from './snapshot-display';

describe('resolveSnapshotNumber', () => {
  const snapshots = [
    { id: 'snap_c', createdAt: '2026-08-30T19:44:00.000Z' },
    { id: 'snap_a', createdAt: '2026-08-28T10:00:00.000Z' },
    { id: 'snap_b', createdAt: '2026-08-29T12:30:00.000Z' },
  ];

  it('numbers snapshots chronologically starting at 1', () => {
    expect(resolveSnapshotNumber(snapshots, 'snap_a')).toBe(1);
    expect(resolveSnapshotNumber(snapshots, 'snap_b')).toBe(2);
    expect(resolveSnapshotNumber(snapshots, 'snap_c')).toBe(3);
  });

  it('is stable regardless of the order returned by the API', () => {
    const reversed = [...snapshots].reverse();

    expect(resolveSnapshotNumber(reversed, 'snap_a')).toBe(1);
    expect(resolveSnapshotNumber(reversed, 'snap_c')).toBe(3);
  });

  it('numbers snapshots of a different project independently', () => {
    const otherProject = [{ id: 'other_1', createdAt: '2026-09-01T08:00:00.000Z' }];

    expect(resolveSnapshotNumber(otherProject, 'other_1')).toBe(1);
  });

  it('breaks identical timestamps deterministically by id', () => {
    const sameTime = [
      { id: 'snap_b', createdAt: '2026-08-30T19:44:00.000Z' },
      { id: 'snap_a', createdAt: '2026-08-30T19:44:00.000Z' },
    ];

    expect(resolveSnapshotNumber(sameTime, 'snap_a')).toBe(1);
    expect(resolveSnapshotNumber(sameTime, 'snap_b')).toBe(2);
  });

  it('returns null when the snapshot is not in the list', () => {
    expect(resolveSnapshotNumber(snapshots, 'missing')).toBeNull();
  });
});

describe('buildSnapshotNumberMap', () => {
  it('maps every snapshot to its chronological number', () => {
    const numbers = buildSnapshotNumberMap([
      { id: 'snap_c', createdAt: '2026-08-30T19:44:00.000Z' },
      { id: 'snap_a', createdAt: '2026-08-28T10:00:00.000Z' },
      { id: 'snap_b', createdAt: '2026-08-29T12:30:00.000Z' },
    ]);

    expect(numbers.get('snap_a')).toBe(1);
    expect(numbers.get('snap_b')).toBe(2);
    expect(numbers.get('snap_c')).toBe(3);
  });

  it('agrees with resolveSnapshotNumber so both pages stay consistent', () => {
    const list = [
      { id: 'snap_2', createdAt: '2026-08-30T19:44:00.000Z' },
      { id: 'snap_1', createdAt: '2026-08-28T10:00:00.000Z' },
    ];

    const numbers = buildSnapshotNumberMap(list);

    for (const item of list) {
      expect(numbers.get(item.id)).toBe(resolveSnapshotNumber(list, item.id));
    }
  });

  it('returns an empty map for an empty project', () => {
    expect(buildSnapshotNumberMap([]).size).toBe(0);
  });
});

describe('formatSnapshotTitle', () => {
  it('renders a sequential title', () => {
    expect(formatSnapshotTitle(1)).toBe('Snapshot 1');
    expect(formatSnapshotTitle(12)).toBe('Snapshot 12');
  });

  it('never exposes an identifier when the number is unknown', () => {
    expect(formatSnapshotTitle(null)).toBe('Snapshot');
  });
});

describe('formatCaptureSource', () => {
  it('formats known capture sources for humans', () => {
    expect(formatCaptureSource('EXTENSION')).toBe('Extension');
    expect(formatCaptureSource('WEB')).toBe('Web');
    expect(formatCaptureSource('API')).toBe('API');
  });
});

describe('formatArchiveSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatArchiveSize(512)).toBe('512 B');
    expect(formatArchiveSize(95744)).toBe('93.5 KB');
    expect(formatArchiveSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('handles missing sizes', () => {
    expect(formatArchiveSize(null)).toBe('Unknown');
  });
});

describe('formatSnapshotCount', () => {
  it('formats counts and unknown values', () => {
    expect(formatSnapshotCount(77)).toBe('77');
    expect(formatSnapshotCount(0)).toBe('0');
    expect(formatSnapshotCount(null)).toBe('Unknown');
  });
});

describe('formatSnapshotCreatedAt', () => {
  it('produces a readable date', () => {
    const formatted = formatSnapshotCreatedAt('2026-08-30T19:44:00.000Z');

    expect(formatted).not.toBe('Unknown');
    expect(formatted).toContain('2026');
  });

  it('handles invalid dates', () => {
    expect(formatSnapshotCreatedAt('not-a-date')).toBe('Unknown');
  });
});

describe('resolveSnapshotFailureMessage', () => {
  it('returns null for completed snapshots so no "Failure: None" is shown', () => {
    expect(resolveSnapshotFailureMessage({ status: 'COMPLETED', failureReason: null })).toBeNull();
    expect(resolveSnapshotFailureMessage({ status: 'PENDING', failureReason: null })).toBeNull();
  });

  it('returns the failure reason for failed snapshots', () => {
    expect(resolveSnapshotFailureMessage({ status: 'FAILED', failureReason: 'Archive was invalid' })).toBe(
      'Archive was invalid',
    );
  });

  it('falls back to a user facing message when no reason is recorded', () => {
    expect(resolveSnapshotFailureMessage({ status: 'FAILED', failureReason: null })).toContain('failed to process');
  });
});
