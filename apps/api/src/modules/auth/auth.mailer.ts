import { env } from '../../config/env.js';
import { HttpError } from '../../core/errors/http-error.js';
import {
  getRecipientDomain,
  getSafeBrevoErrorMetadata,
  silentAuthDiagnosticLogger,
} from './auth.diagnostics.js';
import type { AuthDiagnosticLogger } from './auth.types.js';

const BREVO_EMAIL_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_REQUEST_TIMEOUT_MS = 10_000;

class BrevoRequestError extends Error {
  constructor(
    public readonly httpStatus?: number,
    public readonly providerErrorCode?: string,
    code?: string,
  ) {
    super('Brevo email API request failed');
    this.name = 'BrevoRequestError';
    if (code) {
      Object.defineProperty(this, 'code', { value: code, enumerable: true });
    }
  }
}

function getProviderErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || !('code' in payload)) {
    return undefined;
  }

  const code = payload.code;
  return typeof code === 'string' && /^[A-Z0-9_-]{1,64}$/iu.test(code) ? code : undefined;
}

export type OtpDeliveryResult =
  | {
      otpSent: true;
    }
  | {
      otpSent: true;
      developmentOtp: string;
      deliveryMode: 'DEVELOPMENT_FALLBACK';
    };

export class AuthMailer {
  constructor(private readonly logger: AuthDiagnosticLogger = silentAuthDiagnosticLogger) {}

  private createDevelopmentFallback(otp: string): OtpDeliveryResult {
    return {
      otpSent: true,
      developmentOtp: otp,
      deliveryMode: 'DEVELOPMENT_FALLBACK',
    };
  }

  async sendEmailVerificationOtp(input: { email: string; username: string; otp: string }) {
    if (!env.BREVO_API_KEY || !env.EMAIL_FROM) {
      if (env.NODE_ENV === 'production') {
        throw new HttpError(500, 'EMAIL_PROVIDER_NOT_CONFIGURED', 'Email provider must be configured');
      }

      return this.createDevelopmentFallback(input.otp);
    }

    const startedAt = Date.now();
    const safeMetadata = {
      provider: 'brevo',
      transport: 'https',
      recipientDomain: getRecipientDomain(input.email),
    };
    this.logger.info(safeMetadata, 'OTP email send started');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(BREVO_EMAIL_API_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: {
            email: env.EMAIL_FROM,
          },
          to: [
            {
              email: input.email,
            },
          ],
          subject: 'OCTOPUS verification code',
          htmlContent: `<p>Hello ${input.username},</p><p>Your OCTOPUS verification code is <strong>${input.otp}</strong>.</p><p>It expires in ${env.AUTH_OTP_TTL_MINUTES} minutes.</p>`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let providerErrorCode: string | undefined;
        try {
          providerErrorCode = getProviderErrorCode(await response.json());
        } catch {
          // Do not log response bodies; they may contain recipient or message data.
        }
        throw new BrevoRequestError(response.status, providerErrorCode, 'BREVO_HTTP_ERROR');
      }

      this.logger.info(
        { ...safeMetadata, httpStatus: response.status, elapsedMs: Date.now() - startedAt },
        'OTP email send completed',
      );

      return {
        otpSent: true,
      } satisfies OtpDeliveryResult;
    } catch (error) {
      const safeError = controller.signal.aborted
        ? new BrevoRequestError(undefined, undefined, 'BREVO_HTTP_TIMEOUT')
        : error;
      const failureMetadata = {
        ...safeMetadata,
        elapsedMs: Date.now() - startedAt,
        ...getSafeBrevoErrorMetadata(safeError),
      };

      if (controller.signal.aborted) {
        this.logger.error(failureMetadata, 'OTP email send timed out');
      } else {
        this.logger.error(failureMetadata, 'OTP email send failed');
      }

      if (env.NODE_ENV === 'production') {
        throw new HttpError(503, 'EMAIL_DELIVERY_FAILED', 'Email delivery failed');
      }

      return this.createDevelopmentFallback(input.otp);
    } finally {
      clearTimeout(timeout);
    }
  }
}
