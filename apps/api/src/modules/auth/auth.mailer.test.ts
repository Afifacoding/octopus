import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  verifyImpl?: () => Promise<void>,
) {
  vi.resetModules();

  const sendMail = vi.fn(async () => {
    if (sendMailImpl) {
      await sendMailImpl();
    }
  });

  const verify = vi.fn(async () => {
    if (verifyImpl) {
      await verifyImpl();
    }
  });

  const createTransport = vi.fn((_options: unknown) => ({
    sendMail,
    verify,
  }));

  const logs: Array<{ level: 'info' | 'error'; bindings: Record<string, unknown>; message: string }> = [];
  const logger = {
    info: vi.fn((bindings: Record<string, unknown>, message: string) => {
      logs.push({ level: 'info', bindings, message });
    }),
    error: vi.fn((bindings: Record<string, unknown>, message: string) => {
      logs.push({ level: 'error', bindings, message });
    }),
  };

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
    verify,
    createTransport,
    logger,
    logs,
  };
}

describe('AuthMailer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses SMTP when configured', async () => {
    const { AuthMailer, sendMail, createTransport, verify, logger, logs } = await loadMailerForTest({
      NODE_ENV: 'development',
      EMAIL_SMTP_HOST: 'smtp.example.com',
      EMAIL_SMTP_PORT: 587,
      EMAIL_SMTP_USER: 'user',
      EMAIL_SMTP_PASS: 'pass',
      EMAIL_FROM: 'no-reply@example.com',
    });

    const mailer = new AuthMailer(logger);
    const result = await mailer.sendEmailVerificationOtp({
      email: 'private.recipient@gmail.com',
      username: 'alice',
      otp: 'otp-sensitive-value',
    });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      secure: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }));
    expect(verify).not.toHaveBeenCalled();
    expect(result).toEqual({ otpSent: true });
    expect(logs.map(({ message }) => message)).toEqual([
      'OTP email send started',
      'OTP email send completed',
    ]);
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain('gmail.com');
    expect(serializedLogs).not.toContain('private.recipient');
    expect(serializedLogs).not.toContain('otp-sensitive-value');
    expect(serializedLogs).not.toContain('pass');
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

  it('logs safe SMTP error metadata and preserves the generic production error', async () => {
    const { AuthMailer, logger, logs } = await loadMailerForTest(
      {
        NODE_ENV: 'production',
        EMAIL_SMTP_HOST: 'smtp.example.com',
        EMAIL_SMTP_PORT: 587,
        EMAIL_SMTP_USER: 'smtp-user-sensitive',
        EMAIL_SMTP_PASS: 'smtp-password-sensitive',
        EMAIL_FROM: 'no-reply@example.com',
      },
      async () => {
        const error = new Error('smtp-password-sensitive otp-sensitive-value private.recipient@gmail.com') as Error & {
          code: string;
          command: string;
          response: string;
          responseCode: number;
        };
        error.code = 'EAUTH';
        error.command = 'AUTH PLAIN smtp-password-sensitive';
        error.response = 'Rejected otp-sensitive-value';
        error.responseCode = 535;
        throw error;
      },
    );

    const mailer = new AuthMailer(logger);
    await expect(
      mailer.sendEmailVerificationOtp({
        email: 'private.recipient@gmail.com',
        username: 'alice',
        otp: 'otp-sensitive-value',
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'Email delivery failed',
    });

    expect(logs.at(-1)).toMatchObject({
      level: 'error',
      message: 'OTP email send failed',
      bindings: {
        smtpErrorCode: 'EAUTH',
        smtpResponseCode: 535,
        recipientDomain: 'gmail.com',
      },
    });
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain('smtp-user-sensitive');
    expect(serializedLogs).not.toContain('smtp-password-sensitive');
    expect(serializedLogs).not.toContain('otp-sensitive-value');
    expect(serializedLogs).not.toContain('private.recipient');
    expect(serializedLogs).not.toContain('Rejected');
  });

  it('logs a distinct timeout and preserves the generic production error', async () => {
    vi.useFakeTimers();
    const { AuthMailer, logger, logs } = await loadMailerForTest(
      {
        NODE_ENV: 'production',
        EMAIL_SMTP_HOST: 'smtp.example.com',
        EMAIL_SMTP_PORT: 587,
        EMAIL_SMTP_USER: 'user',
        EMAIL_SMTP_PASS: 'password',
        EMAIL_FROM: 'no-reply@example.com',
      },
      () => new Promise<void>(() => undefined),
    );

    const mailer = new AuthMailer(logger);
    const sendPromise = mailer.sendEmailVerificationOtp({
      email: 'alice@gmail.com',
      username: 'alice',
      otp: '123456',
    });
    const rejection = expect(sendPromise).rejects.toMatchObject({
      statusCode: 503,
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'Email delivery failed',
    });

    await vi.advanceTimersByTimeAsync(45_000);
    await rejection;
    expect(logs.at(-1)?.message).toBe('OTP email send timed out');
    expect(JSON.stringify(logs)).not.toContain('123456');
    expect(JSON.stringify(logs)).not.toContain('password');
  });

  it('provides explicit SMTP verification without invoking it during send', async () => {
    const { AuthMailer, verify, logger, logs } = await loadMailerForTest({
      NODE_ENV: 'production',
      EMAIL_SMTP_HOST: 'smtp.example.com',
      EMAIL_SMTP_PORT: 587,
      EMAIL_SMTP_USER: 'user',
      EMAIL_SMTP_PASS: 'password',
      EMAIL_FROM: 'no-reply@example.com',
    });

    const mailer = new AuthMailer(logger);
    await expect(mailer.verifySmtpConnection()).resolves.toBeUndefined();

    expect(verify).toHaveBeenCalledTimes(1);
    expect(logs.map(({ message }) => message)).toEqual([
      'SMTP verification started',
      'SMTP verification completed',
    ]);
    expect(JSON.stringify(logs)).not.toContain('password');
  });
});
