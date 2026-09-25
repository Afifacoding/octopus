import { getApiBaseUrl } from '../config';
import { OctopusApiError, type ApiEnvelope, type ApiRequestOptions } from './types';

function buildPath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export async function octopusRequestWithMeta<T>(path: string, options: ApiRequestOptions = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  const cancellationPoll = setInterval(() => {
    if (options.cancellationToken?.isCancellationRequested) {
      controller.abort();
    }
  }, 100);

  try {
    const body = options.body ? JSON.stringify(options.body) : null;

    const response = await fetch(`${getApiBaseUrl()}${buildPath(path)}`, {
      method: options.method ?? 'GET',
      headers: {
        'X-Octopus-Client': 'vscode-extension',
        'User-Agent': 'octopus-vscode-extension',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.headers ?? {}),
      },
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = text
      ? (JSON.parse(text) as ApiEnvelope<T>)
      : ({ success: false, error: { code: 'EMPTY_RESPONSE', message: 'No response body' } } as const);

    if (!response.ok || !parsed.success) {
      const code = parsed.success ? 'REQUEST_FAILED' : parsed.error.code;
      const message = parsed.success ? `Request failed with status ${response.status}` : parsed.error.message;
      throw new OctopusApiError(response.status, code, message);
    }

    return {
      data: parsed.data as T,
      status: response.status,
      headers: response.headers,
    };
  } finally {
    clearTimeout(timeout);
    clearInterval(cancellationPoll);
  }
}

export async function octopusRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const result = await octopusRequestWithMeta<T>(path, options);
  return result.data;
}
