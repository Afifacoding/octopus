import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingState } from '../components/states/LoadingState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import {
  createSnapshotBlueprint,
  deleteSnapshotBlueprint,
  getSnapshotBlueprint,
  processSnapshotBlueprint,
} from '../lib/snapshots/snapshots-client';
import type { SnapshotBlueprintMetadata, SnapshotBlueprintResponse } from '../lib/snapshots/types';

function statusTone(status: SnapshotBlueprintResponse['blueprint']['status']) {
  if (status === 'COMPLETED') {
    return 'ok' as const;
  }

  if (status === 'FAILED') {
    return 'warn' as const;
  }

  return 'neutral' as const;
}

function parseMetadata(metadata: SnapshotBlueprintResponse['blueprint']['metadata']): SnapshotBlueprintMetadata {
  if (!metadata) {
    return {};
  }

  return metadata;
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return <span>None</span>;
  }

  return (
    <ul className="body-sm">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function SnapshotBlueprintPage() {
  const { projectId, snapshotId } = useParams();

  const [payload, setPayload] = useState<SnapshotBlueprintResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = async () => {
    if (!projectId || !snapshotId) {
      setError('Snapshot not found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await getSnapshotBlueprint(projectId, snapshotId);

    setIsLoading(false);

    if (!result.success) {
      if (result.error.code === 'BLUEPRINT_NOT_FOUND') {
        setPayload(null);
        return;
      }

      setError(result.error.message);
      return;
    }

    setPayload(result.data);
  };

  useEffect(() => {
    void load();
  }, [projectId, snapshotId]);

  const onCreate = async () => {
    if (!projectId || !snapshotId) {
      return;
    }

    setIsCreating(true);
    setError(null);

    const result = await createSnapshotBlueprint(projectId, snapshotId);

    setIsCreating(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    setPayload(result.data);
  };

  const onProcess = async () => {
    if (!projectId || !snapshotId) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    const result = await processSnapshotBlueprint(projectId, snapshotId);

    setIsProcessing(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    setPayload(result.data);
  };

  const onDelete = async () => {
    if (!projectId || !snapshotId) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    const result = await deleteSnapshotBlueprint(projectId, snapshotId);

    setIsDeleting(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    setPayload(null);
    setIsDeleteOpen(false);
  };

  if (isLoading) {
    return <LoadingState label="Loading blueprint..." />;
  }

  if (error) {
    return <ErrorState title="Blueprint unavailable" message={error} />;
  }

  return (
    <>
      <Card>
        <div className="row-between">
          <div>
            <h3 className="card-title">Blueprint</h3>
            <p className="muted body-sm">Snapshot {snapshotId}</p>
          </div>
          {payload ? <Badge tone={statusTone(payload.blueprint.status)}>{payload.blueprint.status}</Badge> : null}
        </div>

        <div className="project-actions">
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
          <Link className="btn btn-ghost" to={`/projects/${projectId}/snapshots/${snapshotId}/directory`}>
            View full directory
          </Link>
          <Link className="btn btn-ghost" to={`/projects/${projectId}/secrets`}>
            Open Secret Vault
          </Link>
          <Link className="btn btn-ghost" to={`/projects/${projectId}/snapshots/${snapshotId}`}>
            Back to snapshot
          </Link>
        </div>
      </Card>

      {!payload ? (
        <Card>
          <EmptyState
            title="Blueprint not created"
            message="Create a blueprint to analyze project structure, technologies, dependencies, and entry points."
          />
          <div className="project-actions">
            <Button type="button" onClick={() => void onCreate()} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Blueprint'}
            </Button>
          </div>
        </Card>
      ) : null}

      {payload ? (
        <>
          <Card>
            <div className="project-actions">
              <Button type="button" onClick={() => void onProcess()} disabled={isProcessing}>
                {isProcessing
                  ? 'Processing...'
                  : payload.blueprint.status === 'FAILED'
                   ? 'Retry Processing'
                   : payload.blueprint.status === 'COMPLETED'
                    ? 'Regenerate Blueprint'
                    : 'Process Blueprint'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setIsDeleteOpen(true)} disabled={isDeleting}>
                Delete Blueprint
              </Button>
            </div>

            {payload.blueprint.status === 'PROCESSING' || payload.blueprint.status === 'PENDING' ? (
              <LoadingState label="Blueprint processing is in progress." />
            ) : null}

            {payload.blueprint.status === 'FAILED' ? (
              <ErrorState
                title="Blueprint processing failed"
                message={payload.blueprint.failureReason ?? 'Blueprint processing failed'}
              />
            ) : null}
          </Card>

          {payload.blueprint.status === 'COMPLETED' ? (
            <>
              {(() => {
                const metadata = parseMetadata(payload.blueprint.metadata);
                const identity = metadata.projectIdentity;
                const stack = metadata.technologyStack;
                const architecture = metadata.architecture;
                const environment = metadata.environment;
                const configurationFiles = metadata.configurationFiles ?? [];
                const database = metadata.database;
                const deployment = metadata.deployment;
                const completeness = metadata.completeness;
                const structure = metadata.structure;

                return (
                  <>
                    <Card>
                      <h3 className="card-title">Project identity</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Detected project type</span>
                        <span>{identity?.projectType ?? payload.blueprint.projectType ?? 'Unknown'}</span>

                        <span className="muted">Project name</span>
                        <span>{identity?.projectName ?? 'Unknown'}</span>

                        <span className="muted">Primary language</span>
                        <span>{identity?.primaryLanguage ?? payload.blueprint.detectedLanguages[0] ?? 'Unknown'}</span>

                        <span className="muted">Primary framework</span>
                        <span>{identity?.framework ?? payload.blueprint.detectedFrameworks[0] ?? 'Unknown'}</span>

                        <span className="muted">Runtime</span>
                        <span>{identity?.runtime ?? 'Unknown'}</span>

                        <span className="muted">Package manager</span>
                        <span>{identity?.packageManager ?? 'Unknown'}</span>

                        <span className="muted">Application type</span>
                        <span>{identity?.applicationType ?? 'Unknown'}</span>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="card-title">Technology stack</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Frontend</span>
                        <span>{stack?.frontend.join(', ') || 'None'}</span>

                        <span className="muted">Backend</span>
                        <span>{stack?.backend.join(', ') || 'None'}</span>

                        <span className="muted">Database</span>
                        <span>{stack?.database.join(', ') || 'None'}</span>

                        <span className="muted">Tooling</span>
                        <span>{stack?.tooling.join(', ') || 'None'}</span>

                        <span className="muted">All frameworks</span>
                        <span>{payload.blueprint.detectedFrameworks.join(', ') || 'None'}</span>

                        <span className="muted">All languages</span>
                        <span>{payload.blueprint.detectedLanguages.join(', ') || 'None'}</span>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="card-title">Architecture and structure</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Summary</span>
                        <span>{architecture?.summary ?? payload.blueprint.summary ?? 'Not available'}</span>

                        <span className="muted">Confidence</span>
                        <span>{architecture?.confidence ?? 'LOW'}</span>

                        <span className="muted">Flow</span>
                        <span>{architecture?.flow.join(' -> ') || 'Not inferred'}</span>

                        <span className="muted">Top-level directories</span>
                        <span>{structure?.topLevelDirectories.join(', ') || 'None'}</span>

                        <span className="muted">Important folders</span>
                        <span>{structure?.importantFolders?.join(', ') || 'None'}</span>

                        <span className="muted">Total files</span>
                        <span>{structure?.totalFiles ?? 'Unknown'}</span>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="card-title">Entry points and run instructions</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Entry points</span>
                        <span>{payload.blueprint.entryPoints.join(', ') || 'None'}</span>

                        <span className="muted">Detected commands</span>
                        <span>{payload.blueprint.detectedCommands.join(', ') || 'None'}</span>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="card-title">Environment requirements</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Environment files</span>
                        <span>{environment?.references.join(', ') || payload.blueprint.environmentReferences.join(', ') || 'None'}</span>

                        <span className="muted">Variables</span>
                        <span>
                          {environment?.variables.length ? (
                            <ul className="body-sm">
                              {environment.variables.map((item) => (
                                <li key={item.name}>
                                  {item.name} ({item.status}) from {item.sourceFiles.join(', ') || 'unknown source'}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            'None'
                          )}
                        </span>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="card-title">Configuration and dependencies</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Config files</span>
                        <span>{renderList(payload.blueprint.importantConfigFiles)}</span>

                        <span className="muted">Config purpose map</span>
                        <span>
                          {configurationFiles.length > 0 ? (
                            <ul className="body-sm">
                              {configurationFiles.map((item) => (
                                <li key={item.path}>
                                  {item.path}: {item.purpose}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            'None'
                          )}
                        </span>

                        <span className="muted">Dependency metadata</span>
                        <span className="mono">
                          {payload.blueprint.dependencyMetadata
                            ? JSON.stringify(payload.blueprint.dependencyMetadata)
                            : 'None'}
                        </span>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="card-title">Database and deployment</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Database detected</span>
                        <span>{yesNo(database?.detected ?? false)}</span>

                        <span className="muted">Database technology</span>
                        <span>{database?.technology ?? 'Unknown'}</span>

                        <span className="muted">ORM</span>
                        <span>{database?.orm ?? 'Unknown'}</span>

                        <span className="muted">Schema file</span>
                        <span>{database?.schemaFile ?? 'Unknown'}</span>

                        <span className="muted">Migration directory</span>
                        <span>{database?.migrationDirectory ?? 'Unknown'}</span>

                        <span className="muted">Containerization detected</span>
                        <span>{yesNo(deployment?.containerizationDetected ?? false)}</span>

                        <span className="muted">Deployment files</span>
                        <span>{deployment?.deploymentFiles.join(', ') || 'None'}</span>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="card-title">Blueprint health</h3>
                      <div className="snapshot-grid body-sm">
                        <span className="muted">Project structure</span>
                        <span>{yesNo(completeness?.projectStructure ?? false)}</span>

                        <span className="muted">Technology stack</span>
                        <span>{yesNo(completeness?.technologyStack ?? false)}</span>

                        <span className="muted">Dependencies</span>
                        <span>{yesNo(completeness?.dependencies ?? false)}</span>

                        <span className="muted">Entry points</span>
                        <span>{yesNo(completeness?.entryPoints ?? false)}</span>

                        <span className="muted">Environment variables</span>
                        <span>{yesNo(completeness?.environmentVariables ?? false)}</span>

                        <span className="muted">Run instructions</span>
                        <span>{yesNo(completeness?.runInstructions ?? false)}</span>

                        <span className="muted">Database configuration</span>
                        <span>{yesNo(completeness?.databaseConfiguration ?? false)}</span>

                        <span className="muted">Deployment configuration</span>
                        <span>{yesNo(completeness?.deploymentConfiguration ?? false)}</span>

                        <span className="muted">Generated</span>
                        <span>{payload.blueprint.processedAt ?? 'Not processed'}</span>

                        <span className="muted">Updated</span>
                        <span>{payload.blueprint.updatedAt}</span>
                      </div>
                    </Card>
                  </>
                );
              })()}
            </>
          ) : null}
        </>
      ) : null}

      <Modal title="Delete Blueprint" isOpen={isDeleteOpen}>
        <p className="muted body-sm">This permanently deletes the generated blueprint. You can regenerate it later.</p>
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onDelete()} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete Blueprint'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
