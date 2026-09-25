import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingState } from '../components/states/LoadingState';
import { ProjectColorPicker } from '../components/projects/ProjectColorPicker';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { deleteProject, getProject, updateProject } from '../lib/projects/projects-client';
import { executeProjectDelete } from '../lib/projects/delete-flow';
import { buildUpdateProjectInput, resolveEditProjectColor } from '../lib/projects/project-form';
import { getProjectAccentClasses, getProjectCardColorClasses } from '../lib/projects/project-colors';
import type { Project, ProjectColor } from '../lib/projects/types';
import { executeSnapshotDelete } from '../lib/snapshots/delete-flow';
import { deleteSnapshot, listSnapshots } from '../lib/snapshots/snapshots-client';
import {
  buildSnapshotNumberMap,
  formatArchiveSize,
  formatCaptureSource,
  formatSnapshotCount,
  formatSnapshotCreatedAt,
  formatSnapshotTitle,
  resolveSnapshotFailureMessage,
} from '../lib/snapshots/snapshot-display';
import type { SnapshotRecord } from '../lib/snapshots/types';

export function getProjectDeleteGuard(snapshotCount: number) {
  if (snapshotCount <= 0) {
    return {
      canDelete: true,
      message: null,
    } as const;
  }

  const suffix = snapshotCount === 1 ? '' : 's';
  return {
    canDelete: false,
    message: `Delete all ${snapshotCount} snapshot${suffix} before deleting this project.`,
  } as const;
}

export function ProjectDetailsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState<ProjectColor | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isProjectDeleteOpen, setIsProjectDeleteOpen] = useState(false);
  const [isProjectDeleting, setIsProjectDeleting] = useState(false);
  const [projectDeleteError, setProjectDeleteError] = useState<string | null>(null);
  const [projectDeleteSuccess, setProjectDeleteSuccess] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [isSnapshotsLoading, setIsSnapshotsLoading] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);

  const [snapshotDeleteError, setSnapshotDeleteError] = useState<string | null>(null);
  const [snapshotDeleteSuccess, setSnapshotDeleteSuccess] = useState<string | null>(null);
  const [snapshotDeletingId, setSnapshotDeletingId] = useState<string | null>(null);
  const [snapshotPendingDeleteId, setSnapshotPendingDeleteId] = useState<string | null>(null);

  const loadSnapshots = async (targetProjectId: string) => {
    setIsSnapshotsLoading(true);
    setSnapshotsError(null);

    const result = await listSnapshots(targetProjectId);

    setIsSnapshotsLoading(false);

    if (!result.success) {
      setSnapshotsError(result.error.message);
      return;
    }

    setSnapshots(result.data.snapshots);
  };

  const loadProject = async () => {
    if (!projectId) {
      setError('Project not found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await getProject(projectId);

    setIsLoading(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    setProject(result.data.project);
    setEditName(result.data.project.name);
    setEditDescription(result.data.project.description ?? '');
    setEditColor(resolveEditProjectColor(result.data.project.color));
    await loadSnapshots(result.data.project.id);
  };

  useEffect(() => {
    void loadProject();
  }, [projectId]);

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) {
      return;
    }

    setEditError(null);
    setIsSaving(true);

    const result = await updateProject(
      projectId,
      buildUpdateProjectInput({
        name: editName,
        description: editDescription,
        color: editColor,
      }),
    );

    setIsSaving(false);

    if (!result.success) {
      setEditError(result.error.message);
      return;
    }

    setProject(result.data.project);
    setIsEditOpen(false);
  };

  const onDeleteSnapshot = async (snapshotId: string) => {
    if (!projectId) {
      return;
    }

    setSnapshotDeleteSuccess(null);

    const deleted = await executeSnapshotDelete({
      deleteRequest: () => deleteSnapshot(projectId, snapshotId),
      setDeleting: (isDeleting) => setSnapshotDeletingId(isDeleting ? snapshotId : null),
      setError: setSnapshotDeleteError,
      onSuccess: () => {
        setSnapshotPendingDeleteId(null);
        setSnapshotDeleteSuccess('Snapshot deleted successfully');
      },
    });

    if (!deleted) {
      return;
    }

    await loadSnapshots(projectId);
  };

  const statusTone = (status: SnapshotRecord['status']) => {
    if (status === 'COMPLETED') {
      return 'ok' as const;
    }

    if (status === 'FAILED') {
      return 'warn' as const;
    }

    return 'warn' as const;
  };

  const latestSnapshot = snapshots[0] ?? null;
  const snapshotNumbers = useMemo(() => buildSnapshotNumberMap(snapshots), [snapshots]);
  const projectDeleteGuard = useMemo(() => getProjectDeleteGuard(snapshots.length), [snapshots.length]);

  const onDeleteProject = async () => {
    if (!projectId) {
      return;
    }

    const deleted = await executeProjectDelete({
      deleteRequest: () => deleteProject(projectId),
      setDeleting: setIsProjectDeleting,
      setError: setProjectDeleteError,
      onSuccess: () => {
        setIsProjectDeleteOpen(false);
        setProjectDeleteSuccess('Project deleted successfully');
      },
    });

    if (!deleted) {
      return;
    }

    navigate('/projects');
  };

  if (isLoading) {
    return <LoadingState label="Loading project details..." />;
  }

  if (error) {
    return <ErrorState title="Project unavailable" message={error} />;
  }

  if (!project) {
    return <EmptyState title="Project not found" message="The selected project does not exist." />;
  }

  const cardColors = getProjectCardColorClasses(project.color);
  const accentClassName = getProjectAccentClasses(project.color);

  return (
    <>
      <Card className={accentClassName}>
        <div className="row-between">
          <div className="project-card-header-main">
            {cardColors.hasColor ? (
              <span className={cardColors.iconClassName}>{project.name.charAt(0).toUpperCase() || 'P'}</span>
            ) : null}
            <div>
              <h3 className="card-title">{project.name}</h3>
              <p className="muted body-sm">{project.description || 'No description provided'}</p>
            </div>
          </div>
          {cardColors.hasColor ? (
            <span className="project-color-indicator" aria-label={`${project.color} project color`} />
          ) : null}
        </div>

        <div className="project-meta muted meta-sm">
          <span>Created: {new Date(project.createdAt).toLocaleString()}</span>
          <span>Updated: {new Date(project.updatedAt).toLocaleString()}</span>
        </div>

        <div className="project-actions">
          <Button variant="secondary" type="button" onClick={() => setIsEditOpen(true)}>
            Edit project
          </Button>
          <Link className="btn btn-secondary" to={`/projects/${project.id}/secrets`}>
            Secret Vault
          </Link>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setProjectDeleteError(null);
              setProjectDeleteSuccess(null);
              setIsProjectDeleteOpen(true);
            }}
            disabled={!projectDeleteGuard.canDelete || isSnapshotsLoading || Boolean(snapshotsError)}
          >
            Delete project
          </Button>
          <Link className="btn btn-ghost" to="/projects">
            Back to projects
          </Link>
        </div>
        {!projectDeleteGuard.canDelete ? <p className="form-error">{projectDeleteGuard.message}</p> : null}
        {projectDeleteSuccess ? <p className="muted body-sm">{projectDeleteSuccess}</p> : null}
        {projectDeleteError ? <p className="form-error">{projectDeleteError}</p> : null}
      </Card>

      <Card className={accentClassName}>
        <div className="row-between">
          <div>
            <h4 className="card-title">Snapshot History</h4>
            <p className="muted body-sm">View and manage saved versions of {project.name}.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (projectId) {
                void loadSnapshots(projectId);
              }
            }}
            disabled={isSnapshotsLoading}
          >
            {isSnapshotsLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {latestSnapshot ? (
          <p className="muted meta-sm">
            Latest snapshot: {formatSnapshotTitle(snapshotNumbers.get(latestSnapshot.id) ?? null)} ·{' '}
            {formatSnapshotCreatedAt(latestSnapshot.createdAt)}
          </p>
        ) : null}

        {isSnapshotsLoading ? <LoadingState label="Loading snapshots..." /> : null}
        {snapshotsError ? <ErrorState title="Snapshots unavailable" message={snapshotsError} /> : null}

        {!isSnapshotsLoading && !snapshotsError && snapshots.length === 0 ? (
          <EmptyState
            title="No snapshots yet"
            message="Save a snapshot from the OCTOPUS VS Code extension to see it here."
          />
        ) : null}

        {!isSnapshotsLoading && !snapshotsError && snapshots.length > 0 ? (
          <div className="projects-grid">
            {snapshots.map((snapshot) => {
              const failureMessage = resolveSnapshotFailureMessage(snapshot);

              return (
              <Card key={snapshot.id} className="project-card">
                <div className="row-between">
                  <div>
                    <h5 className="card-title">
                      {formatSnapshotTitle(snapshotNumbers.get(snapshot.id) ?? null)}
                    </h5>
                    <p className="muted meta-sm">Source: {formatCaptureSource(snapshot.captureSource)}</p>
                  </div>
                  <Badge tone={statusTone(snapshot.status)}>{snapshot.status}</Badge>
                </div>

                <div className="project-meta muted meta-sm">
                  <span>Created: {formatSnapshotCreatedAt(snapshot.createdAt)}</span>
                  <span>Size: {formatArchiveSize(snapshot.archiveSizeBytes)}</span>
                  <span>Files: {formatSnapshotCount(snapshot.fileCount)}</span>
                </div>

                {failureMessage ? (
                  <p className="form-error meta-sm" role="alert">
                    {failureMessage}
                  </p>
                ) : null}

                <div className="project-actions">
                  <Link className="btn btn-secondary" to={`/projects/${project.id}/snapshots/${snapshot.id}`}>
                    Details
                  </Link>
                  {snapshot.status === 'COMPLETED' ? (
                    <>
                      <Link
                        className="btn btn-ghost"
                        to={`/projects/${project.id}/snapshots/${snapshot.id}/directory`}
                      >
                        Directory Tree
                      </Link>
                      <Link
                        className="btn btn-ghost"
                        to={`/projects/${project.id}/snapshots/${snapshot.id}/blueprint`}
                      >
                        Blueprint
                      </Link>
                      <Link className="btn btn-ghost" to={`/projects/${project.id}/secrets`}>
                        Secret Vault
                      </Link>
                    </>
                  ) : null}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setSnapshotPendingDeleteId(snapshot.id)}
                    disabled={snapshotDeletingId === snapshot.id}
                  >
                    {snapshotDeletingId === snapshot.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </Card>
              );
            })}
          </div>
        ) : null}

        {snapshotDeleteError ? <p className="form-error">{snapshotDeleteError}</p> : null}
        {snapshotDeleteSuccess ? <p className="muted body-sm">{snapshotDeleteSuccess}</p> : null}
      </Card>

      <Modal title="Delete Snapshot" isOpen={snapshotPendingDeleteId !== null}>
        <p className="muted body-sm">
          This permanently deletes the selected snapshot, its archive, and generated blueprint data.
        </p>
        <div className="modal-actions">
          <Button
            variant="ghost"
            type="button"
            onClick={() => setSnapshotPendingDeleteId(null)}
            disabled={snapshotPendingDeleteId !== null && snapshotDeletingId === snapshotPendingDeleteId}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (snapshotPendingDeleteId) {
                void onDeleteSnapshot(snapshotPendingDeleteId);
              }
            }}
            disabled={snapshotPendingDeleteId !== null && snapshotDeletingId === snapshotPendingDeleteId}
          >
            {snapshotPendingDeleteId !== null && snapshotDeletingId === snapshotPendingDeleteId
              ? 'Deleting...'
              : 'Delete Permanently'}
          </Button>
        </div>
      </Modal>

      <Modal title="Edit Project" isOpen={isEditOpen}>
        <form className="form-stack" onSubmit={onSave}>
          <label className="eyebrow" htmlFor="edit-project-name">
            Project name
          </label>
          <Input
            id="edit-project-name"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            required
          />

          <label className="eyebrow" htmlFor="edit-project-description">
            Description
          </label>
          <Input
            id="edit-project-description"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
          />

          <ProjectColorPicker value={editColor} onChange={setEditColor} idPrefix="edit-project" />

          {editError ? <p className="form-error">{editError}</p> : null}

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal title="Delete Project" isOpen={isProjectDeleteOpen}>
        <div className="form-stack">
          <p className="body-sm">
            This permanently deletes this project and all project-owned records. This action cannot be undone.
          </p>
          {projectDeleteError ? <p className="form-error">{projectDeleteError}</p> : null}
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsProjectDeleteOpen(false)} disabled={isProjectDeleting}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" disabled={isProjectDeleting} onClick={() => void onDeleteProject()}>
              {isProjectDeleting ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
