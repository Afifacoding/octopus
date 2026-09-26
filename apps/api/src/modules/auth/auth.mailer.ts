import nodemailer from 'nodemailer';

import { env } from '../../config/env.js';
import { HttpError } from '../../core/errors/http-error.js';
import {
  getRecipientDomain,
  getSafeSmtpErrorMetadata,
  silentAuthDiagnosticLogger,
} from './auth.diagnostics.js';
import type { AuthDiagnosticLogger } from './auth.types.js';

const SMTP_OPERATION_TIMEOUT_MS = 45_000;

class SmtpOperationTimeoutError extends Error {
  constructor() {
    super('SMTP operation exceeded its deadline');
    this.name = 'SmtpOperationTimeoutError';
  }
}

function withSmtpOperationTimeout<T>(operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new SmtpOperationTimeoutError()), SMTP_OPERATION_TIMEOUT_MS);
  });

  return Promise.race([operation, deadline]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
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

  private readonly smtpConfigured =
    typeof env.EMAIL_SMTP_HOST === 'string' &&
    typeof env.EMAIL_SMTP_PORT === 'number' &&
    typeof env.EMAIL_FROM === 'string';

  private readonly transporter = this.smtpConfigured
    ? nodemailer.createTransport({
        host: env.EMAIL_SMTP_HOST,
        port: env.EMAIL_SMTP_PORT,
        secure: env.EMAIL_SMTP_PORT === 465,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        ...(typeof env.EMAIL_SMTP_USER === 'string' && typeof env.EMAIL_SMTP_PASS === 'string'
          ? {
              auth: {
                user: env.EMAIL_SMTP_USER,
                pass: env.EMAIL_SMTP_PASS,
              },
            }
          : {}),
      })
    : null;

  async verifySmtpConnection() {
    if (!this.smtpConfigured || !this.transporter || !env.EMAIL_FROM) {
      throw new HttpError(503, 'SMTP_NOT_CONFIGURED', 'SMTP must be configured');
    }

    const startedAt = Date.now();
    const smtpMetadata = {
      smtpHost: env.EMAIL_SMTP_HOST,
      smtpPort: env.EMAIL_SMTP_PORT,
    };
    this.logger.info(smtpMetadata, 'SMTP verification started');

    try {
      await withSmtpOperationTimeout(this.transporter.verify());
      this.logger.info(
        { ...smtpMetadata, elapsedMs: Date.now() - startedAt },
        'SMTP verification completed',
      );
    } catch (error) {
      const failureMetadata = {
        ...smtpMetadata,
        elapsedMs: Date.now() - startedAt,
        ...getSafeSmtpErrorMetadata(error),
      };

      if (error instanceof SmtpOperationTimeoutError) {
        this.logger.error(failureMetadata, 'SMTP verification timed out');
      } else {
        this.logger.error(failureMetadata, 'SMTP verification failed');
      }

      throw new HttpError(503, 'SMTP_VERIFICATION_FAILED', 'SMTP verification failed');
    }
  }

  private createDevelopmentFallback(otp: string): OtpDeliveryResult {
    return {
      otpSent: true,
      developmentOtp: otp,
      deliveryMode: 'DEVELOPMENT_FALLBACK',
    };
  }

  async sendEmailVerificationOtp(input: { email: string; username: string; otp: string }) {
    if (!this.smtpConfigured || !this.transporter || !env.EMAIL_FROM) {
      if (env.NODE_ENV === 'production') {
        throw new HttpError(500, 'SMTP_NOT_CONFIGURED', 'SMTP must be configured in production');
      }

      return this.createDevelopmentFallback(input.otp);
    }

    const startedAt = Date.now();
    const safeMetadata = {
      recipientDomain: getRecipientDomain(input.email),
      smtpHost: env.EMAIL_SMTP_HOST,
      smtpPort: env.EMAIL_SMTP_PORT,
    };
    this.logger.info(safeMetadata, 'OTP email send started');

    try {
      await withSmtpOperationTimeout(this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: input.email,
        subject: 'OCTOPUS verification code',
        text: `Hello ${input.username}, your OCTOPUS verification code is ${input.otp}. It expires in ${env.AUTH_OTP_TTL_MINUTES} minutes.`,
        html: `<p>Hello ${input.username},</p><p>Your OCTOPUS verification code is <strong>${input.otp}</strong>.</p><p>It expires in ${env.AUTH_OTP_TTL_MINUTES} minutes.</p>`,
      }));

      this.logger.info(
        { ...safeMetadata, elapsedMs: Date.now() - startedAt },
        'OTP email send completed',
      );

      return {
        otpSent: true,
      } satisfies OtpDeliveryResult;
    } catch (error) {
      const failureMetadata = {
        ...safeMetadata,
        elapsedMs: Date.now() - startedAt,
        ...getSafeSmtpErrorMetadata(error),
      };

      if (error instanceof SmtpOperationTimeoutError) {
        this.logger.error(failureMetadata, 'OTP email send timed out');
      } else {
        this.logger.error(failureMetadata, 'OTP email send failed');
      }

      if (env.NODE_ENV === 'production') {
        throw new HttpError(503, 'EMAIL_DELIVERY_FAILED', 'Email delivery failed');
      }

      return this.createDevelopmentFallback(input.otp);
    }
  }
}
