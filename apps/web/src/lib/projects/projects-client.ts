import type { ApiEnvelope } from '../auth/types';
import { apiRequest } from '../api/client';
import type { Project, ProjectColor, ProjectListResponse, ProjectStatus } from './types';

export async function createProject(input: { name: string; description?: string; color?: ProjectColor }) {
  return apiRequest<{ project: Project }>('/projects', {
    method: 'POST',
    body: input,
  }) as Promise<ApiEnvelope<{ project: Project }>>;
}

export async function listProjects(params?: { q?: string; status?: ProjectStatus }) {
  const search = new URLSearchParams();
  if (params?.q) {
    search.set('q', params.q);
  }

  if (params?.status) {
    search.set('status', params.status);
  }

  const queryString = search.toString();
  const path = queryString ? `/projects?${queryString}` : '/projects';

  return apiRequest<ProjectListResponse>(path, {
    method: 'GET',
  }) as Promise<ApiEnvelope<ProjectListResponse>>;
}

export async function getProject(projectId: string) {
  return apiRequest<{ project: Project }>(`/projects/${projectId}`, {
    method: 'GET',
  }) as Promise<ApiEnvelope<{ project: Project }>>;
}

export async function updateProject(projectId: string, input: { name?: string; description?: string; color?: ProjectColor | null }) {
  return apiRequest<{ project: Project }>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: input,
  }) as Promise<ApiEnvelope<{ project: Project }>>;
}

export async function deleteProject(projectId: string) {
  return apiRequest<{ projectId: string; deleted: boolean }>(`/projects/${projectId}/permanent`, {
    method: 'DELETE',
  }) as Promise<ApiEnvelope<{ projectId: string; deleted: boolean }>>;
}
