import { beforeEach, describe, expect, it, vi } from 'vitest';

type EnvOverrides = {
  NODE_ENV?: 'development' | 'test' | 'production';
  EMAIL_SMTP_HOST?: string;
  EMAIL_SMTP_PORT?: number;
  EMAIL_SMTP_USER?: string;
  EMAIL_SMTP_PASS?: string;
  EMAIL_FROM?: string;
  AUTH_OTP_TTL_MINUTES?: number;
};

async function loadMailerForTest(
  envOverrides: EnvOverrides,
  sendMailImpl?: () => Promise<void>,
) {
  vi.resetModules();

  const sendMail = vi.fn(async () => {
    if (sendMailImpl) {
      await sendMailImpl();
    }
  });

  const createTransport = vi.fn(() => ({
    sendMail,
  }));

  vi.doMock('nodemailer', () => ({
    default: {
      createTransport,
    },
  }));

  vi.doMock('../../config/env.js', () => ({
    env: {
      NODE_ENV: 'development',
      AUTH_OTP_TTL_MINUTES: 10,
      ...envOverrides,
    },
  }));

  const mod = await import('./auth.mailer.js');

  return {
    AuthMailer: mod.AuthMailer,
    sendMail,
    createTransport,
  };
}

describe('AuthMailer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('uses SMTP when configured', async () => {
    const { AuthMailer, sendMail, createTransport } = await loadMailerForTest({
      NODE_ENV: 'development',
      EMAIL_SMTP_HOST: 'smtp.example.com',
      EMAIL_SMTP_PORT: 587,
      EMAIL_SMTP_USER: 'user',
      EMAIL_SMTP_PASS: 'pass',
      EMAIL_FROM: 'no-reply@example.com',
    });

    const mailer = new AuthMailer();
    const result = await mailer.sendEmailVerificationOtp({
      email: 'alice@gmail.com',
      username: 'alice',
      otp: '123456',
    });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ otpSent: true });
  });

  it('skips SMTP in development when not configured and returns fallback OTP', async () => {
    const { AuthMailer, sendMail, createTransport } = await loadMailerForTest({
      NODE_ENV: 'development',
      AUTH_OTP_TTL_MINUTES: 10,
    });

    const mailer = new AuthMailer();
    const result = await mailer.sendEmailVerificationOtp({
      email: 'alice@gmail.com',
      username: 'alice',
      otp: '654321',
    });

    expect(createTransport).toHaveBeenCalledTimes(0);
    expect(sendMail).toHaveBeenCalledTimes(0);
    expect(result).toEqual({
      otpSent: true,
      developmentOtp: '654321',
      deliveryMode: 'DEVELOPMENT_FALLBACK',
    });
  });

  it('falls back in development when SMTP send fails', async () => {
    const { AuthMailer, sendMail, createTransport } = await loadMailerForTest(
      {
        NODE_ENV: 'development',
        EMAIL_SMTP_HOST: 'smtp.example.com',
        EMAIL_SMTP_PORT: 587,
        EMAIL_SMTP_USER: 'user',
        EMAIL_SMTP_PASS: 'pass',
        EMAIL_FROM: 'no-reply@example.com',
      },
      async () => {
        throw new Error('smtp unavailable');
      },
    );

    const mailer = new AuthMailer();
    const result = await mailer.sendEmailVerificationOtp({
      email: 'alice@gmail.com',
      username: 'alice',
      otp: '111222',
    });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      otpSent: true,
      developmentOtp: '111222',
      deliveryMode: 'DEVELOPMENT_FALLBACK',
    });
  });

  it('enforces SMTP in production when missing', async () => {
    const { AuthMailer } = await loadMailerForTest({
      NODE_ENV: 'production',
      AUTH_OTP_TTL_MINUTES: 10,
    });

    const mailer = new AuthMailer();

    await expect(
      mailer.sendEmailVerificationOtp({
        email: 'alice@gmail.com',
        username: 'alice',
        otp: '000111',
      }),
    ).rejects.toMatchObject({ code: 'SMTP_NOT_CONFIGURED' });
  });
});
