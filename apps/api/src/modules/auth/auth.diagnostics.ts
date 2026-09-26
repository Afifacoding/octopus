import type { AuthDiagnosticLogger } from './auth.types.js';

export const silentAuthDiagnosticLogger: AuthDiagnosticLogger = {
  info: () => undefined,
  error: () => undefined,
};

export function getRecipientDomain(email: string) {
  const separatorIndex = email.lastIndexOf('@');
  return separatorIndex >= 0 ? email.slice(separatorIndex + 1).toLowerCase() : 'unknown';
}

export function getSafeBrevoErrorMetadata(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const brevoError = error as {
    code?: unknown;
    httpStatus?: unknown;
    providerErrorCode?: unknown;
  };

  const metadata: Record<string, unknown> = {};

  if (typeof brevoError.code === 'string' && /^[A-Z0-9_-]{1,40}$/iu.test(brevoError.code)) {
    metadata.errorCode = brevoError.code;
  }

  if (
    typeof brevoError.httpStatus === 'number' &&
    Number.isInteger(brevoError.httpStatus) &&
    brevoError.httpStatus >= 100 &&
    brevoError.httpStatus <= 599
  ) {
    metadata.httpStatus = brevoError.httpStatus;
  }

  if (
    typeof brevoError.providerErrorCode === 'string' &&
    /^[A-Z0-9_-]{1,64}$/iu.test(brevoError.providerErrorCode)
  ) {
    metadata.providerErrorCode = brevoError.providerErrorCode;
  }

  return metadata;
}