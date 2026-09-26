import type { AuthDiagnosticLogger } from './auth.types.js';

export const silentAuthDiagnosticLogger: AuthDiagnosticLogger = {
  info: () => undefined,
  error: () => undefined,
};

export function getRecipientDomain(email: string) {
  const separatorIndex = email.lastIndexOf('@');
  return separatorIndex >= 0 ? email.slice(separatorIndex + 1).toLowerCase() : 'unknown';
}

export function getSafeSmtpErrorMetadata(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const smtpError = error as {
    code?: unknown;
    command?: unknown;
    responseCode?: unknown;
  };

  const metadata: Record<string, unknown> = {};

  if (typeof smtpError.code === 'string' && /^[A-Z0-9_-]{1,40}$/iu.test(smtpError.code)) {
    metadata.smtpErrorCode = smtpError.code;
  }

  if (
    typeof smtpError.command === 'string' &&
    /^(?:CONN|AUTH(?: (?:PLAIN|LOGIN|XOAUTH2|CRAM-MD5))?|EHLO|HELO|STARTTLS|MAIL FROM|RCPT TO|DATA|QUIT|RSET)$/iu.test(
      smtpError.command,
    )
  ) {
    metadata.smtpCommand = smtpError.command;
  }

  if (
    typeof smtpError.responseCode === 'number' &&
    Number.isInteger(smtpError.responseCode) &&
    smtpError.responseCode >= 100 &&
    smtpError.responseCode <= 599
  ) {
    metadata.smtpResponseCode = smtpError.responseCode;
  }

  return metadata;
}