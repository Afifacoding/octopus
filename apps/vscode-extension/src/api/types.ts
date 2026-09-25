export type ApiError = {
  code: string;
  message: string;
};

export type ApiEnvelope<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ApiError;
    };

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  cancellationToken?: { isCancellationRequested: boolean };
};

export class OctopusApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'OctopusApiError';
  }
}
