import type { ApiResponse } from '@octopus/shared';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export const apiBaseUrl = baseUrl;

export type ApiBinaryResponse = {
  blob: Blob;
  fileName: string | null;
};

export async function apiDownload(path: string, fallbackFileName: string): Promise<ApiBinaryResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/zip',
    },
  });

  if (!response.ok) {
    let message = `Download failed (${response.status})`;

    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      if (payload?.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // Response was not JSON; keep the status-based message.
    }

    throw new Error(message);
  }

  const disposition = response.headers.get('content-disposition');
  const match = disposition ? /filename="?([^";]+)"?/i.exec(disposition) : null;

  return {
    blob: await response.blob(),
    fileName: match?.[1] ?? fallbackFileName,
  };
}

type ApiRequestInit = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiRequest<T>(
  path: string,
  init?: ApiRequestInit,
): Promise<ApiResponse<T>> {
  const { body: rawBody, headers: initHeaders, ...rest } = init ?? {};
  const serializedBody = rawBody !== undefined ? JSON.stringify(rawBody) : undefined;
  const headers: Record<string, string> = {
    ...(serializedBody ? { 'Content-Type': 'application/json' } : {}),
    ...(initHeaders ?? {}),
  };

  const requestInit: RequestInit = {
    credentials: 'include',
    ...rest,
    headers,
  };

  if (serializedBody !== undefined) {
    requestInit.body = serializedBody;
  }

  const response = await fetch(`${baseUrl}${path}`, requestInit);

  const responsePayload = (await response.json()) as ApiResponse<T>;
  return responsePayload;
}
