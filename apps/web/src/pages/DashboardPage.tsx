import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../components/ui/Card';
import { getExtensionConnectionStatus } from '../lib/auth/auth-client';
import type { ExtensionConnectionStatus } from '../lib/auth/types';
import { listProjects } from '../lib/projects/projects-client';
import { listSnapshots } from '../lib/snapshots/snapshots-client';
import { buildSnapshotSearchEntries, type SnapshotSearchEntry } from '../lib/snapshots/snapshot-search';
import type { SnapshotRecord } from '../lib/snapshots/types';

export function getExtensionConnectionCardContent(status: ExtensionConnectionStatus | null) {
  if (status?.connected) {
    return {
      title: 'VS Code Connected',
      description: 'OCTOPUS extension is active.',
      connected: true,
    } as const;
  }

  return {
    title: 'VS Code Not Connected',
    description: 'Connect the OCTOPUS extension to enable workspace capture.',
    connected: false,
  } as const;
}

export function DashboardPage() {
  const [connectionStatus, setConnectionStatus] = useState<ExtensionConnectionStatus | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [snapshotEntries, setSnapshotEntries] = useState<SnapshotSearchEntry[]>([]);
  const latestStatusRequestIdRef = useRef(0);
  const latestWorkspaceRequestIdRef = useRef(0);

  const loadStatus = useCallback(async () => {
    const requestId = latestStatusRequestIdRef.current + 1;
    latestStatusRequestIdRef.current = requestId;

    setConnectionError(null);

    const result = await getExtensionConnectionStatus();
    if (requestId !== latestStatusRequestIdRef.current) {
      return;
    }

    if (!result.success) {
      setConnectionError(result.error.message);
      return;
    }

    setConnectionStatus(result.data);
  }, []);

  useEffect(() => {
    void loadStatus();

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, 5000);

    const handleFocus = () => {
      void loadStatus();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadStatus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadStatus]);

  const loadWorkspace = useCallback(async () => {
    const requestId = latestWorkspaceRequestIdRef.current + 1;
    latestWorkspaceRequestIdRef.current = requestId;

    const projectsResult = await listProjects({ status: 'ACTIVE' });
    if (requestId !== latestWorkspaceRequestIdRef.current || !projectsResult.success) {
      return;
    }

    const projects = projectsResult.data.projects;
    setProjectCount(projects.length);

    const snapshotResults = await Promise.all(projects.map((project) => listSnapshots(project.id)));
    if (requestId !== latestWorkspaceRequestIdRef.current) {
      return;
    }

    const snapshotsByProjectId: Record<string, SnapshotRecord[]> = {};
    projects.forEach((project, index) => {
      const result = snapshotResults[index];
      snapshotsByProjectId[project.id] = result?.success ? result.data.snapshots : [];
    });

    // buildSnapshotSearchEntries sorts every snapshot across all projects by its
    // actual createdAt timestamp, so entries[0] is always the newest capture -
    // never based on per-project snapshot number or fetch/array order.
    setSnapshotEntries(buildSnapshotSearchEntries(projects, snapshotsByProjectId));
  }, []);

  useEffect(() => {
    void loadWorkspace();

    // Snapshots are usually captured from the VS Code extension while this tab
    // stays open. Focus/visibility alone isn't a guaranteed trigger (e.g. the
    // tab may never blur in split-screen/multi-monitor setups), so also poll
    // on the same 5s cadence as the connection-status refresh above.
    const intervalId = window.setInterval(() => {
      void loadWorkspace();
    }, 5000);

    const handleFocus = () => {
      void loadWorkspace();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadWorkspace();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadWorkspace]);

  const connection = getExtensionConnectionCardContent(connectionStatus);
  const workspaceName = connectionStatus?.workspaceName ?? null;
  const lastSnapshot = useMemo(() => snapshotEntries[0] ?? null, [snapshotEntries]);

  return (
    <>
      <section className={`card integration-card ${connection.connected ? 'is-connected' : ''}`}>
        <div className="integration-card-main">
          <div className="eyebrow">VS Code Integration</div>
          <h3 className="integration-status">
            <span className="integration-dot" aria-hidden="true" />
            {connection.title}
          </h3>
          <p className="muted body-sm">{connection.description}</p>
        </div>
        {connection.connected && workspaceName ? (
          <div className="integration-card-meta">
            <span className="eyebrow">Workspace</span>
            <span className="body-sm">{workspaceName}</span>
          </div>
        ) : null}
      </section>

      {connectionError ? <p className="form-error">{connectionError}</p> : null}

      <div className="dashboard-kpis">
        <Card compact>
          <div className="eyebrow">Total Projects</div>
          <div className="metric">{projectCount ?? '—'}</div>
          <div className="muted meta-sm">Projects in your workspace</div>
        </Card>

        <Card compact>
          <div className="eyebrow">Last Snapshot</div>
          {lastSnapshot ? (
            <>
              <div className="metric">{lastSnapshot.label}</div>
              <div className="muted meta-sm">
                {lastSnapshot.projectName} · {lastSnapshot.createdAtLabel}
              </div>
              <Link
                className="dashboard-kpi-link body-sm"
                to={`/projects/${lastSnapshot.projectId}/snapshots/${lastSnapshot.snapshotId}`}
              >
                View snapshot
              </Link>
            </>
          ) : (
            <>
              <div className="metric">—</div>
              <div className="muted meta-sm">No snapshots yet</div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
