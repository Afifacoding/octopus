import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { OctoSnapshotComparison } from '../../lib/octo/octo-client';
import { OctoIntelligenceCard } from './OctoIntelligenceCard';

const comparison: OctoSnapshotComparison = {
  projectId: 'proj-1',
  projectName: 'Backend API',
  base: { id: 'snap-1', sequence: 1, status: 'COMPLETED', createdAt: '2026-03-01T10:00:00.000Z', fileCount: 3, directoryCount: 1, archiveSizeBytes: 900 },
  target: { id: 'snap-2', sequence: 2, status: 'COMPLETED', createdAt: '2026-03-02T10:00:00.000Z', fileCount: 3, directoryCount: 1, archiveSizeBytes: 950 },
  summary: {
    baseFileCount: 3,
    targetFileCount: 3,
    added: 1,
    modified: 1,
    deleted: 1,
    unchanged: 1,
    changed: 3,
    baseTotalBytes: 300,
    targetTotalBytes: 340,
    netSizeDeltaBytes: 40,
    sensitiveChanged: 1,
  },
  added: [{ path: 'src/new.ts', status: 'ADDED', baseSizeBytes: null, targetSizeBytes: 100, sizeDeltaBytes: 100, sensitive: false }],
  modified: [{ path: '.env', status: 'MODIFIED', baseSizeBytes: 50, targetSizeBytes: 60, sizeDeltaBytes: 10, sensitive: true }],
  deleted: [{ path: 'src/old.ts', status: 'DELETED', baseSizeBytes: 70, targetSizeBytes: null, sizeDeltaBytes: -70, sensitive: false }],
  unchanged: [{ path: 'README.md', status: 'UNCHANGED', baseSizeBytes: 180, targetSizeBytes: 180, sizeDeltaBytes: 0, sensitive: false }],
  truncated: { added: false, modified: false, deleted: false, unchanged: false },
  directories: [],
};

describe('OctoIntelligenceCard', () => {
  it('renders verified comparison counts and files per category', () => {
    const html = renderToStaticMarkup(<OctoIntelligenceCard payload={{ kind: 'SNAPSHOT_COMPARISON', comparison }} />);

    expect(html).toContain('Verified OCTOPUS data');
    expect(html).toContain('Backend API: Snapshot #1');
    expect(html).toContain('<strong>1</strong> added');
    expect(html).toContain('Added (1)');
    expect(html).toContain('Modified (1)');
    expect(html).toContain('Deleted (1)');
    expect(html).toContain('Unchanged (1)');
    expect(html).toContain('src/new.ts');
    expect(html).toContain('src/old.ts');
    expect(html).toContain('+40 B net');
  });

  it('flags sensitive paths without showing contents', () => {
    const html = renderToStaticMarkup(<OctoIntelligenceCard payload={{ kind: 'SNAPSHOT_COMPARISON', comparison }} />);

    expect(html).toContain('class="octo-intel-sensitive"');
    expect(html).toContain('File contents and secret values are never shown.');
  });

  it('notes files counted by the server but not listed', () => {
    const capped = { ...comparison, summary: { ...comparison.summary, added: 4 }, truncated: { ...comparison.truncated, added: true } };
    const html = renderToStaticMarkup(<OctoIntelligenceCard payload={{ kind: 'SNAPSHOT_COMPARISON', comparison: capped }} />);

    expect(html).toContain('3 more not listed.');
  });

  it('renders workspace stats and project snapshot lists', () => {
    const stats = renderToStaticMarkup(
      <OctoIntelligenceCard
        payload={{
          kind: 'WORKSPACE_STATS',
          stats: {
            countingRules: [],
            projectCount: 2,
            completedSnapshotCount: 5,
            failedSnapshotCount: 1,
            inProgressSnapshotCount: 0,
            projects: [
              { id: 'a', name: 'Alpha', color: '#14b8a6', completedSnapshots: 1, failedSnapshots: 1, inProgressSnapshots: 0, latestSnapshotAt: null },
              { id: 'b', name: 'Beta', color: '#6366f1', completedSnapshots: 4, failedSnapshots: 0, inProgressSnapshots: 0, latestSnapshotAt: '2026-03-02T10:00:00.000Z' },
            ],
            mostSnapshots: { count: 4, projects: [{ id: 'b', name: 'Beta' }] },
            latestSnapshot: null,
          },
        }}
      />,
    );
    expect(stats).toContain('<strong>2</strong> active projects');
    expect(stats).toContain('<strong>5</strong> completed snapshots');
    expect(stats.indexOf('Beta')).toBeLessThan(stats.indexOf('Alpha'));

    const list = renderToStaticMarkup(
      <OctoIntelligenceCard
        payload={{
          kind: 'PROJECT_SNAPSHOTS',
          project: { id: 'b', name: 'Beta' },
          snapshots: [{
            id: 's1', sequence: 1, status: 'COMPLETED', captureSource: 'EXTENSION', clientName: null, clientVersion: null,
            createdAt: '2026-03-02T10:00:00.000Z', processedAt: null, fileCount: 12, directoryCount: 3, archiveSizeBytes: 2048, failureCode: null,
          }],
        }}
      />,
    );
    expect(list).toContain('Beta · 1 snapshot');
    expect(list).toContain('2 KB');
    expect(list).toContain('is-completed');
  });
});
