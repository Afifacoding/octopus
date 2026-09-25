import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingState } from '../components/states/LoadingState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { getProject } from '../lib/projects/projects-client';
import { getProjectAccentClasses } from '../lib/projects/project-colors';
import type { ProjectColor } from '../lib/projects/types';
import {
  deleteSnapshot,
  downloadSnapshotAsZip,
  getSnapshot,
  getSnapshotBlueprint,
  listSnapshots,
} from '../lib/snapshots/snapshots-client';
import {
  formatArchiveSize,
  formatCaptureSource,
  formatSnapshotCount,
  formatSnapshotCreatedAt,
  formatSnapshotTitle,
  resolveSnapshotFailureMessage,
  resolveSnapshotNumber,
} from '../lib/snapshots/snapshot-display';
import { executeSnapshotDelete } from '../lib/snapshots/delete-flow';
import type { SnapshotBlueprintResponse, SnapshotRecord } from '../lib/snapshots/types';

function statusTone(status: SnapshotRecord['status']) {
  if (status === 'COMPLETED') {
    return 'ok' as const;
  }

  if (status === 'FAILED') {
    return 'warn' as const;
  }

  return 'warn' as const;
}

export function SnapshotDetailsPage() {
  const { projectId, snapshotId } = useParams();
  const navigate = useNavigate();

  const [snapshot, setSnapshot] = useState<SnapshotRecord | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectColor, setProjectColor] = useState<ProjectColor | null>(null);
  const [snapshotNumber, setSnapshotNumber] = useState<number | null>(null);
  const [blueprint, setBlueprint] = useState<SnapshotBlueprintResponse['blueprint'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!projectId || !snapshotId) {
        setError('Snapshot not found');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const result = await getSnapshot(projectId, snapshotId);

      setIsLoading(false);

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      setSnapshot(result.data.snapshot);

      const [projectResult, snapshotsResult] = await Promise.all([
        getProject(projectId),
        listSnapshots(projectId),
      ]);

      if (projectResult.success) {
        setProjectName(projectResult.data.project.name);
        setProjectColor(projectResult.data.project.color);
      }

      if (snapshotsResult.success) {
        setSnapshotNumber(resolveSnapshotNumber(snapshotsResult.data.snapshots, snapshotId));
      }

      const blueprintResult = await getSnapshotBlueprint(projectId, snapshotId);
      if (!blueprintResult.success) {
        if (blueprintResult.error.code !== 'BLUEPRINT_NOT_FOUND') {
          setBlueprintError(blueprintResult.error.message);
        }
        return;
      }

      setBlueprint(blueprintResult.data.blueprint);
    };

    void load();
  }, [projectId, snapshotId]);

  if (isLoading) {
    return <LoadingState label="Loading snapshot details..." />;
  }

  if (error) {
    return <ErrorState title="Snapshot unavailable" message={error} />;
  }

  if (!snapshot) {
    return <EmptyState title="Snapshot not found" message="The selected snapshot is not available." />;
  }

  const onDeleteSnapshot = async () => {
    if (!projectId || !snapshotId) {
      return;
    }

    const deleted = await executeSnapshotDelete({
      deleteRequest: () => deleteSnapshot(projectId, snapshotId),
      setDeleting: setIsDeleting,
      setError: setDeleteError,
      onSuccess: () => {
        setIsDeleteOpen(false);
      },
    });

    if (!deleted) {
      return;
    }

    navigate(`/projects/${projectId}`);
  };

  const onDownloadSnapshot = async () => {
    if (!projectId || !snapshotId || isDownloading) {
      return;
    }

    setDownloadError(null);
    setDownloadSuccess(null);
    setIsDownloading(true);

    try {
      const result = await downloadSnapshotAsZip(projectId, snapshotId);
      setDownloadSuccess(`Download started: ${result.fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to prepare snapshot ZIP';
      setDownloadError(message);
    } finally {
      setIsDownloading(false);
    }
  };

  const failureMessage = resolveSnapshotFailureMessage(snapshot);
  const accentClassName = getProjectAccentClasses(projectColor);

  return (
    <>
      <Card className={accentClassName}>
        <div className="row-between">
          <div>
            <h3 className="card-title">{formatSnapshotTitle(snapshotNumber)}</h3>
            <p className="muted body-sm">Snapshot details for this capture</p>
          </div>
          <Badge tone={statusTone(snapshot.status)}>{snapshot.status}</Badge>
        </div>

        <dl className="snapshot-summary body-sm">
          <div className="snapshot-summary-item">
            <dt className="muted">Project</dt>
            <dd>{projectName ?? 'Loading...'}</dd>
          </div>

          <div className="snapshot-summary-item">
            <dt className="muted">Capture source</dt>
            <dd>{formatCaptureSource(snapshot.captureSource)}</dd>
          </div>

          <div className="snapshot-summary-item">
            <dt className="muted">Created</dt>
            <dd>{formatSnapshotCreatedAt(snapshot.createdAt)}</dd>
          </div>

          <div className="snapshot-summary-item">
            <dt className="muted">Archive size</dt>
            <dd>{formatArchiveSize(snapshot.archiveSizeBytes)}</dd>
          </div>

          <div className="snapshot-summary-item">
            <dt className="muted">Files</dt>
            <dd>{formatSnapshotCount(snapshot.fileCount)}</dd>
          </div>

          <div className="snapshot-summary-item">
            <dt className="muted">Directories</dt>
            <dd>{formatSnapshotCount(snapshot.directoryCount)}</dd>
          </div>
        </dl>

        {failureMessage ? (
          <p className="form-error" role="alert">
            {failureMessage}
          </p>
        ) : null}

        <div className="project-actions">
          {snapshot.status === 'COMPLETED' ? (
            <>
              <Button
                variant="primary"
                type="button"
                className="snapshot-download-button"
                onClick={() => void onDownloadSnapshot()}
                disabled={isDownloading}
                aria-busy={isDownloading}
              >
                {isDownloading ? 'Preparing ZIP...' : 'Download as ZIP'}
              </Button>
              <Link className="btn btn-secondary" to={`/projects/${snapshot.projectId}/snapshots/${snapshot.id}/directory`}>
                Open Directory Tree
              </Link>
              <Link className="btn btn-secondary" to={`/projects/${snapshot.projectId}/snapshots/${snapshot.id}/blueprint`}>
                Open Blueprint
              </Link>
            </>
          ) : (
            <span className="muted body-sm">Directory tree available after snapshot processing completes.</span>
          )}
          <Link className="btn btn-secondary" to={`/projects/${snapshot.projectId}`}>
            Back to project
          </Link>
          <Link className="btn btn-secondary" to={`/projects/${snapshot.projectId}/secrets`}>
            Open Secret Vault
          </Link>
          <Button variant="ghost" type="button" onClick={() => setIsDeleteOpen(true)}>
            Delete Snapshot
          </Button>
        </div>

        {deleteError ? <p className="form-error">{deleteError}</p> : null}
        {downloadError ? (
          <p className="form-error" role="alert">
            {downloadError}
          </p>
        ) : null}
        {downloadSuccess ? (
          <p className="form-success" role="status">
            {downloadSuccess}
          </p>
        ) : null}
        {snapshot.status === 'COMPLETED' ? (
          <p className="muted body-sm">
            Downloads include the full project structure. Secret Vault values and detected credentials are masked in
            the archive and stay available only through Secret Vault.
          </p>
        ) : null}
      </Card>

      <Card>
        <h4 className="card-title">Blueprint Status</h4>
        {blueprint ? (
          <>
            <p className="muted body-sm">Status: {blueprint.status}</p>
            <div className="snapshot-grid body-sm">
              <span className="muted">Project type</span>
              <span>{blueprint.projectType ?? 'Unknown'}</span>

              <span className="muted">Frameworks</span>
              <span>{blueprint.detectedFrameworks.join(', ') || 'None'}</span>

              <span className="muted">Languages</span>
              <span>{blueprint.detectedLanguages.join(', ') || 'None'}</span>

              <span className="muted">Entry points</span>
              <span>{blueprint.entryPoints.join(', ') || 'None'}</span>
            </div>
          </>
        ) : (
          <p className="muted body-sm">Blueprint has not been generated for this snapshot yet.</p>
        )}

        {blueprintError ? <p className="form-error">{blueprintError}</p> : null}
      </Card>

      <Modal title="Delete Snapshot" isOpen={isDeleteOpen}>
        <p className="muted body-sm">
          This permanently deletes the snapshot, stored archive, and derived blueprint data. This action cannot be undone.
        </p>
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onDeleteSnapshot()} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
