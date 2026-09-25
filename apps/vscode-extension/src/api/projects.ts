import { octopusRequest } from './client';

export type Project = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export async function listProjects(options: { cookie: string; timeoutMs: number }) {
  return octopusRequest<{ projects: Project[] }>('/projects?status=ACTIVE', {
    method: 'GET',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
  });
}

export async function createProject(options: {
  cookie: string;
  timeoutMs: number;
  name: string;
  description?: string;
}) {
  return octopusRequest<{ project: Project }>('/projects', {
    method: 'POST',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
    body: {
      name: options.name,
      ...(options.description !== undefined ? { description: options.description } : {}),
    },
  });
}
