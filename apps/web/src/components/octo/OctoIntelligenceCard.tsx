import type {
  OctoIntelligencePayload,
  OctoSnapshotComparison,
  OctoSnapshotSummary,
  OctoWorkspaceStats,
} from '../../lib/octo/octo-client';
import {
  COMPARISON_CATEGORIES,
  describeFileSizeChange,
  formatSignedBytes,
  formatSnapshotRef,
  hiddenFileCount,
} from '../../lib/octo/octo-intelligence';
import { formatArchiveSize, formatSnapshotCreatedAt } from '../../lib/snapshots/snapshot-display';

export function OctoIntelligenceCard({ payload }: { payload: OctoIntelligencePayload }) {
  return (
    <div className="octo-intel-card" data-kind={payload.kind}>
      <div className="octo-intel-badge">Verified OCTOPUS data</div>
      {payload.kind === 'WORKSPACE_STATS' && <WorkspaceStats stats={payload.stats} />}
      {payload.kind === 'PROJECT_SNAPSHOTS' && <ProjectSnapshots projectName={payload.project.name} snapshots={payload.snapshots} />}
      {payload.kind === 'SNAPSHOT_COMPARISON' && <SnapshotComparison comparison={payload.comparison} />}
    </div>
  );
}

function plural(count: number, word: string) {
  return `${word}${count === 1 ? '' : 's'}`;
}

function WorkspaceStats({ stats }: { stats: OctoWorkspaceStats }) {
  const projects = [...stats.projects].sort((left, right) => right.completedSnapshots - left.completedSnapshots);

  return (
    <>
      <div className="octo-intel-metrics">
        <span><strong>{stats.projectCount}</strong> active {plural(stats.projectCount, 'project')}</span>
        <span><strong>{stats.completedSnapshotCount}</strong> completed {plural(stats.completedSnapshotCount, 'snapshot')}</span>
        {stats.failedSnapshotCount > 0 && <span><strong>{stats.failedSnapshotCount}</strong> failed</span>}
        {stats.inProgressSnapshotCount > 0 && <span><strong>{stats.inProgressSnapshotCount}</strong> in progress</span>}
      </div>
      {projects.length > 0 && (
        <div className="octo-intel-table-wrap">
          <table className="octo-intel-table">
            <thead>
              <tr><th>Project</th><th>Completed</th><th>Failed</th><th>Latest</th></tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><span className="octo-intel-dot" style={{ background: project.color }} />{project.name}</td>
                  <td>{project.completedSnapshots}</td>
                  <td>{project.failedSnapshots}</td>
                  <td>{project.latestSnapshotAt ? formatSnapshotCreatedAt(project.latestSnapshotAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ProjectSnapshots({ projectName, snapshots }: { projectName: string; snapshots: OctoSnapshotSummary[] }) {
  return (
    <>
      <p className="octo-intel-title">{projectName} · {snapshots.length} {plural(snapshots.length, 'snapshot')}</p>
      {snapshots.length > 0 && (
        <div className="octo-intel-table-wrap">
          <table className="octo-intel-table">
            <thead>
              <tr><th>#</th><th>Captured</th><th>Status</th><th>Files</th><th>Size</th></tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{snapshot.sequence ?? '—'}</td>
                  <td>{formatSnapshotCreatedAt(snapshot.createdAt)}</td>
                  <td><span className={`octo-intel-status is-${snapshot.status.toLowerCase()}`}>{snapshot.status}</span></td>
                  <td>{snapshot.fileCount ?? '—'}</td>
                  <td>{formatArchiveSize(snapshot.archiveSizeBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SnapshotComparison({ comparison }: { comparison: OctoSnapshotComparison }) {
  const { summary } = comparison;

  return (
    <>
      <p className="octo-intel-title">
        {comparison.projectName}: {formatSnapshotRef(comparison.base)} → {formatSnapshotRef(comparison.target)}
      </p>
      <div className="octo-intel-metrics">
        <span className="is-added"><strong>{summary.added}</strong> added</span>
        <span className="is-modified"><strong>{summary.modified}</strong> modified</span>
        <span className="is-deleted"><strong>{summary.deleted}</strong> deleted</span>
        <span><strong>{summary.unchanged}</strong> unchanged</span>
        <span>{summary.baseFileCount} → {summary.targetFileCount} files</span>
        <span>{formatSignedBytes(summary.netSizeDeltaBytes)} net</span>
      </div>
      {summary.sensitiveChanged > 0 && (
        <p className="octo-intel-note">
          {summary.sensitiveChanged} changed {plural(summary.sensitiveChanged, 'file')} matched sensitive-file patterns. File contents and secret values are never shown.
        </p>
      )}
      {COMPARISON_CATEGORIES.map(({ key, label }) => {
        if (summary[key] === 0) return null;
        const hidden = hiddenFileCount(comparison, key);

        return (
          <details key={key} className={`octo-intel-files is-${key}`} open={key !== 'unchanged' && summary.changed <= 20}>
            <summary>{label} ({summary[key]})</summary>
            <ul>
              {comparison[key].map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>
                  {file.sensitive && <span className="octo-intel-sensitive">sensitive</span>}
                  <span className="octo-intel-size">{describeFileSizeChange(file)}</span>
                </li>
              ))}
            </ul>
            {hidden > 0 && <p className="octo-intel-note">{hidden} more not listed.</p>}
          </details>
        );
      })}
    </>
  );
}
