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

type CancellationLike = { isCancellationRequested: boolean };

export async function listProjects(options: { cookie: string; timeoutMs: number; cancellationToken?: CancellationLike }) {
  return octopusRequest<{ projects: Project[] }>('/projects?status=ACTIVE', {
    method: 'GET',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
    ...(options.cancellationToken ? { cancellationToken: options.cancellationToken } : {}),
  });
}

export async function createProject(options: {
  cookie: string;
  timeoutMs: number;
  name: string;
  description?: string;
  cancellationToken?: CancellationLike;
}) {
  return octopusRequest<{ project: Project }>('/projects', {
    method: 'POST',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
    ...(options.cancellationToken ? { cancellationToken: options.cancellationToken } : {}),
    body: {
      name: options.name,
      ...(options.description !== undefined ? { description: options.description } : {}),
    },
  });
}
