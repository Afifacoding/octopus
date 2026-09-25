import { octopusRequest, octopusRequestWithMeta } from './client';

export async function login(options: { emailOrUsername: string; password: string; timeoutMs: number }) {
  return octopusRequestWithMeta<{ user: { id: string; username: string; email: string } }>('/auth/login', {
    method: 'POST',
    timeoutMs: options.timeoutMs,
    body: {
      emailOrUsername: options.emailOrUsername,
      password: options.password,
    },
  });
}

export async function me(options: { cookie: string; timeoutMs: number }) {
  return octopusRequest<{ user: { id: string; username: string; email: string } }>('/auth/me', {
    method: 'GET',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
  });
}
