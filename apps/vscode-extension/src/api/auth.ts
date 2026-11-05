import { octopusRequest, octopusRequestWithMeta } from './client';

export async function login(options: {
  emailOrUsername: string;
  password: string;
  timeoutMs: number;
  cancellationToken?: { isCancellationRequested: boolean };
}) {
  return octopusRequestWithMeta<{ user: { id: string; username: string; email: string } }>('/auth/login', {
    method: 'POST',
    timeoutMs: options.timeoutMs,
    ...(options.cancellationToken ? { cancellationToken: options.cancellationToken } : {}),
    body: {
      emailOrUsername: options.emailOrUsername,
      password: options.password,
    },
  });
}

export async function me(options: {
  cookie: string;
  timeoutMs: number;
  cancellationToken?: { isCancellationRequested: boolean };
}) {
  return octopusRequest<{ user: { id: string; username: string; email: string } }>('/auth/me', {
    method: 'GET',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
    ...(options.cancellationToken ? { cancellationToken: options.cancellationToken } : {}),
  });
}
