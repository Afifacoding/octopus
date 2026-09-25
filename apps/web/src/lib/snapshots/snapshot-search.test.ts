import { describe, expect, it } from 'vitest';

import { buildSnapshotSearchEntries, filterSnapshotSearchEntries } from './snapshot-search';
import type { SnapshotRecord } from './types';

function snapshot(overrides: Partial<SnapshotRecord> & Pick<SnapshotRecord, 'id' | 'createdAt'>): SnapshotRecord {
  return {
    projectId: 'project_1',
    status: 'COMPLETED',
    captureSource: 'EXTENSION',
    clientName: null,
    clientVersion: null,
    archiveStorageKey: null,
    archiveContentType: null,
    archiveSizeBytes: 1024,
    fileCount: 10,
    directoryCount: 2,
    integrityAlgorithm: null,
    integrityHash: null,
    failureCode: null,
    failureReason: null,
    captureMetadata: null,
    processedAt: null,
    updatedAt: overrides.createdAt,
    ...overrides,
  } as SnapshotRecord;
}

const projects = [
  { id: 'project_1', name: 'My Portfolio Website' },
  { id: 'project_2', name: 'OCTOTEST2026' },
];

const snapshotsByProjectId = {
  project_1: [
    snapshot({ id: 'p1_s1', createdAt: '2026-08-28T10:00:00.000Z' }),
    snapshot({ id: 'p1_s2', createdAt: '2026-08-30T19:44:00.000Z' }),
  ],
  project_2: [
    snapshot({ id: 'p2_s1', createdAt: '2026-08-29T09:00:00.000Z', projectId: 'project_2', captureSource: 'API' }),
  ],
};

describe('buildSnapshotSearchEntries', () => {
  it('numbers snapshots per project', () => {
    const entries = buildSnapshotSearchEntries(projects, snapshotsByProjectId);

    expect(entries.find((entry) => entry.snapshotId === 'p1_s1')?.label).toBe('Snapshot 1');
    expect(entries.find((entry) => entry.snapshotId === 'p1_s2')?.label).toBe('Snapshot 2');
    expect(entries.find((entry) => entry.snapshotId === 'p2_s1')?.label).toBe('Snapshot 1');
  });

  it('sorts entries newest first so the first entry is the last snapshot taken', () => {
    const entries = buildSnapshotSearchEntries(projects, snapshotsByProjectId);

    expect(entries[0]?.snapshotId).toBe('p1_s2');
    expect(entries[0]?.projectName).toBe('My Portfolio Website');
  });

  it('never exposes raw identifiers in displayed fields', () => {
    const entries = buildSnapshotSearchEntries(projects, snapshotsByProjectId);

    for (const entry of entries) {
      expect(entry.label).not.toContain(entry.snapshotId);
      expect(entry.projectName).not.toContain(entry.projectId);
    }
  });

  it('handles projects with no snapshots', () => {
    const entries = buildSnapshotSearchEntries([{ id: 'empty', name: 'Empty' }], {});

    expect(entries).toEqual([]);
  });
});

describe('Dashboard "Last Snapshot" selection (regression: must use createdAt, not snapshot number)', () => {
  it('picks a newer Snapshot 1 in another project over an older Snapshot 2', () => {
    // env demo: Snapshot 2, created earlier. OperationBlackbox: Snapshot 1, created just now.
    const dashboardProjects = [
      { id: 'env_demo', name: 'env demo' },
      { id: 'operation_blackbox', name: 'OperationBlackbox' },
    ];

    const dashboardSnapshots = {
      env_demo: [
        snapshot({ id: 'env_s1', createdAt: '2026-08-01T08:00:00.000Z', projectId: 'env_demo' }),
        snapshot({ id: 'env_s2', createdAt: '2026-08-02T08:00:00.000Z', projectId: 'env_demo' }),
      ],
      operation_blackbox: [
        snapshot({ id: 'ob_s1', createdAt: '2026-09-14T12:00:00.000Z', projectId: 'operation_blackbox' }),
      ],
    };

    const entries = buildSnapshotSearchEntries(dashboardProjects, dashboardSnapshots);
    const lastSnapshot = entries[0] ?? null;

    expect(lastSnapshot?.snapshotId).toBe('ob_s1');
    expect(lastSnapshot?.label).toBe('Snapshot 1');
    expect(lastSnapshot?.projectName).toBe('OperationBlackbox');
  });

  it('reflects a newly created snapshot as the last snapshot once it is included in the data', () => {
    const dashboardProjects = [{ id: 'project_1', name: 'env demo' }];

    const before = buildSnapshotSearchEntries(dashboardProjects, {
      project_1: [snapshot({ id: 's1', createdAt: '2026-08-01T08:00:00.000Z' })],
    });
    expect(before[0]?.snapshotId).toBe('s1');

    // Simulate a refetch after a new snapshot was captured.
    const after = buildSnapshotSearchEntries(dashboardProjects, {
      project_1: [
        snapshot({ id: 's1', createdAt: '2026-08-01T08:00:00.000Z' }),
        snapshot({ id: 's2', createdAt: '2026-09-14T12:00:00.000Z' }),
      ],
    });

    expect(after[0]?.snapshotId).toBe('s2');
    expect(after[0]?.label).toBe('Snapshot 2');
  });

  it('correctly identifies the newest snapshot across many projects with independent numbering', () => {
    const dashboardProjects = [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
      { id: 'p3', name: 'Gamma' },
    ];

    const dashboardSnapshots = {
      p1: [
        snapshot({ id: 'p1_a', createdAt: '2026-01-01T00:00:00.000Z', projectId: 'p1' }),
        snapshot({ id: 'p1_b', createdAt: '2026-01-05T00:00:00.000Z', projectId: 'p1' }),
        snapshot({ id: 'p1_c', createdAt: '2026-01-10T00:00:00.000Z', projectId: 'p1' }),
      ],
      p2: [snapshot({ id: 'p2_a', createdAt: '2026-01-20T00:00:00.000Z', projectId: 'p2' })],
      p3: [
        snapshot({ id: 'p3_a', createdAt: '2026-01-03T00:00:00.000Z', projectId: 'p3' }),
        snapshot({ id: 'p3_b', createdAt: '2026-01-04T00:00:00.000Z', projectId: 'p3' }),
      ],
    };

    const entries = buildSnapshotSearchEntries(dashboardProjects, dashboardSnapshots);

    // p2_a (Snapshot 1 of Beta) is the newest overall despite every other project
    // having higher per-project snapshot numbers.
    expect(entries[0]?.snapshotId).toBe('p2_a');
    expect(entries[0]?.label).toBe('Snapshot 1');
    expect(entries[0]?.projectName).toBe('Beta');
  });

  it('has no last snapshot when there are no snapshots across any project', () => {
    const dashboardProjects = [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ];

    const entries = buildSnapshotSearchEntries(dashboardProjects, { p1: [], p2: [] });

    expect(entries[0] ?? null).toBeNull();
  });

  it('only considers snapshots belonging to projects provided to it (user isolation)', () => {
    // The caller (Dashboard) only passes the authenticated user's own projects,
    // so a snapshot map entry for a project that isn't in the list must be ignored.
    const dashboardProjects = [{ id: 'my_project', name: 'My Project' }];

    const dashboardSnapshots = {
      my_project: [snapshot({ id: 'mine', createdAt: '2026-01-01T00:00:00.000Z', projectId: 'my_project' })],
      someone_elses_project: [
        snapshot({ id: 'not_mine', createdAt: '2026-09-14T12:00:00.000Z', projectId: 'someone_elses_project' }),
      ],
    };

    const entries = buildSnapshotSearchEntries(dashboardProjects, dashboardSnapshots);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.snapshotId).toBe('mine');
  });
});

describe('filterSnapshotSearchEntries', () => {
  const entries = buildSnapshotSearchEntries(projects, snapshotsByProjectId);

  it('returns nothing for an empty query', () => {
    expect(filterSnapshotSearchEntries(entries, '')).toEqual([]);
    expect(filterSnapshotSearchEntries(entries, '   ')).toEqual([]);
  });

  it('matches by project name', () => {
    const results = filterSnapshotSearchEntries(entries, 'portfolio');

    expect(results).toHaveLength(2);
    expect(results.every((entry) => entry.projectName === 'My Portfolio Website')).toBe(true);
  });

  it('matches by snapshot number', () => {
    const results = filterSnapshotSearchEntries(entries, 'portfolio snapshot 2');

    expect(results).toHaveLength(1);
    expect(results[0]?.snapshotId).toBe('p1_s2');
  });

  it('does not let a numeric term match part of a year', () => {
    expect(filterSnapshotSearchEntries(entries, '20')).toEqual([]);
    expect(filterSnapshotSearchEntries(entries, '2026')).toHaveLength(3);
  });

  it('matches by capture source', () => {
    const results = filterSnapshotSearchEntries(entries, 'api');

    expect(results).toHaveLength(1);
    expect(results[0]?.snapshotId).toBe('p2_s1');
  });

  it('matches by status', () => {
    expect(filterSnapshotSearchEntries(entries, 'completed')).toHaveLength(3);
  });

  it('matches by date', () => {
    const results = filterSnapshotSearchEntries(entries, '2026');

    expect(results).toHaveLength(3);
  });

  it('requires every term to match', () => {
    const results = filterSnapshotSearchEntries(entries, 'portfolio api');

    expect(results).toEqual([]);
  });

  it('is case insensitive', () => {
    expect(filterSnapshotSearchEntries(entries, 'OCTOTEST2026')).toHaveLength(1);
  });

  it('returns no matches for an unrelated query', () => {
    expect(filterSnapshotSearchEntries(entries, 'nonexistent')).toEqual([]);
  });

  it('caps the number of results', () => {
    expect(filterSnapshotSearchEntries(entries, 'snapshot', 2)).toHaveLength(2);
  });
});
