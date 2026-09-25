import nodemailer from 'nodemailer';

import { env } from '../../config/env.js';
import { HttpError } from '../../core/errors/http-error.js';

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
  private readonly smtpConfigured =
    typeof env.EMAIL_SMTP_HOST === 'string' &&
    typeof env.EMAIL_SMTP_PORT === 'number' &&
    typeof env.EMAIL_FROM === 'string';

  private readonly transporter = this.smtpConfigured
    ? nodemailer.createTransport({
        host: env.EMAIL_SMTP_HOST,
        port: env.EMAIL_SMTP_PORT,
        secure: env.EMAIL_SMTP_PORT === 465,
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

    try {
      await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: input.email,
        subject: 'OCTOPUS verification code',
        text: `Hello ${input.username}, your OCTOPUS verification code is ${input.otp}. It expires in ${env.AUTH_OTP_TTL_MINUTES} minutes.`,
        html: `<p>Hello ${input.username},</p><p>Your OCTOPUS verification code is <strong>${input.otp}</strong>.</p><p>It expires in ${env.AUTH_OTP_TTL_MINUTES} minutes.</p>`,
      });

      return {
        otpSent: true,
      } satisfies OtpDeliveryResult;
    } catch {
      if (env.NODE_ENV === 'production') {
        throw new HttpError(503, 'EMAIL_DELIVERY_FAILED', 'Email delivery failed');
      }

      return this.createDevelopmentFallback(input.otp);
    }
  }
}
