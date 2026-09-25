import { apiDownload, apiRequest } from '../api/client';
import type { ApiEnvelope } from '../auth/types';
import type {
  SnapshotBlueprintResponse,
  SnapshotCreateRequest,
  SnapshotDirectoryTreeResponse,
  SnapshotFileContentResponse,
  SnapshotRecord,
} from './types';

export async function createSnapshot(projectId: string, input: SnapshotCreateRequest) {
  return apiRequest<{ snapshot: SnapshotRecord }>(`/projects/${projectId}/snapshots`, {
    method: 'POST',
    body: input,
  }) as Promise<ApiEnvelope<{ snapshot: SnapshotRecord }>>;
}

export async function listSnapshots(projectId: string) {
  return apiRequest<{ snapshots: SnapshotRecord[] }>(`/projects/${projectId}/snapshots`, {
    method: 'GET',
  }) as Promise<ApiEnvelope<{ snapshots: SnapshotRecord[] }>>;
}

export async function getSnapshot(projectId: string, snapshotId: string) {
  return apiRequest<{ snapshot: SnapshotRecord }>(`/projects/${projectId}/snapshots/${snapshotId}`, {
    method: 'GET',
  }) as Promise<ApiEnvelope<{ snapshot: SnapshotRecord }>>;
}

export async function deleteSnapshot(projectId: string, snapshotId: string) {
  return apiRequest<{ snapshot: SnapshotRecord }>(`/projects/${projectId}/snapshots/${snapshotId}`, {
    method: 'DELETE',
  }) as Promise<ApiEnvelope<{ snapshot: SnapshotRecord }>>;
}

export async function getSnapshotDirectoryTree(projectId: string, snapshotId: string) {
  return apiRequest<SnapshotDirectoryTreeResponse>(
    `/projects/${projectId}/snapshots/${snapshotId}/directory-tree`,
    {
      method: 'GET',
    },
  ) as Promise<ApiEnvelope<SnapshotDirectoryTreeResponse>>;
}

export async function getSnapshotFileContent(projectId: string, snapshotId: string, filePath: string) {
  const encodedPath = encodeURIComponent(filePath);

  return apiRequest<SnapshotFileContentResponse>(
    `/projects/${projectId}/snapshots/${snapshotId}/file-content?path=${encodedPath}`,
    {
      method: 'GET',
    },
  ) as Promise<ApiEnvelope<SnapshotFileContentResponse>>;
}

export async function createSnapshotBlueprint(projectId: string, snapshotId: string) {
  return apiRequest<SnapshotBlueprintResponse>(`/projects/${projectId}/snapshots/${snapshotId}/blueprint`, {
    method: 'POST',
  }) as Promise<ApiEnvelope<SnapshotBlueprintResponse>>;
}

export async function getSnapshotBlueprint(projectId: string, snapshotId: string) {
  return apiRequest<SnapshotBlueprintResponse>(`/projects/${projectId}/snapshots/${snapshotId}/blueprint`, {
    method: 'GET',
  }) as Promise<ApiEnvelope<SnapshotBlueprintResponse>>;
}

export async function processSnapshotBlueprint(projectId: string, snapshotId: string) {
  return apiRequest<SnapshotBlueprintResponse>(`/projects/${projectId}/snapshots/${snapshotId}/blueprint/process`, {
    method: 'POST',
  }) as Promise<ApiEnvelope<SnapshotBlueprintResponse>>;
}

export async function deleteSnapshotBlueprint(projectId: string, snapshotId: string) {
  return apiRequest<SnapshotBlueprintResponse>(`/projects/${projectId}/snapshots/${snapshotId}/blueprint`, {
    method: 'DELETE',
  }) as Promise<ApiEnvelope<SnapshotBlueprintResponse>>;
}

export async function downloadSnapshotArchive(projectId: string, snapshotId: string, projectName?: string) {
  const fallbackFileName = buildFallbackSnapshotFileName(projectName, snapshotId);

  return apiDownload(`/projects/${projectId}/snapshots/${snapshotId}/download`, fallbackFileName);
}

export function buildFallbackSnapshotFileName(projectName: string | undefined, snapshotId: string) {
  const safeProjectName = (projectName ?? 'project')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return `${safeProjectName || 'project'}_snapshot_${snapshotId}.zip`;
}

export function triggerBrowserDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  link.rel = 'noopener';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(objectUrl);
}

export async function downloadSnapshotAsZip(projectId: string, snapshotId: string, projectName?: string) {
  const result = await downloadSnapshotArchive(projectId, snapshotId, projectName);
  const fileName = result.fileName ?? buildFallbackSnapshotFileName(projectName, snapshotId);

  triggerBrowserDownload(result.blob, fileName);

  return { fileName };
}
