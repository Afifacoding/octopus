import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EnvOverrides = {
  NODE_ENV?: 'development' | 'test' | 'production';
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  AUTH_OTP_TTL_MINUTES?: number;
};

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const successfulResponse = (): MockResponse => ({
  ok: true,
  status: 201,
  json: async () => ({}),
});

async function loadMailerForTest(envOverrides: EnvOverrides, fetchImpl?: typeof fetch) {
  vi.resetModules();

  const fetchMock = vi.fn(fetchImpl ?? (async () => successfulResponse() as Response));
  vi.stubGlobal('fetch', fetchMock);

  const logs: Array<{ level: 'info' | 'error'; bindings: Record<string, unknown>; message: string }> = [];
  const logger = {
    info: vi.fn((bindings: Record<string, unknown>, message: string) => {
      logs.push({ level: 'info', bindings, message });
    }),
    error: vi.fn((bindings: Record<string, unknown>, message: string) => {
      logs.push({ level: 'error', bindings, message });
    }),
  };

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
    fetchMock,
    logger,
    logs,
  };
}

describe('AuthMailer via Brevo HTTPS API', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends the existing OTP email using the Brevo API and logs no sensitive values', async () => {
    const apiKey = 'brevo-api-key-sensitive';
    const otp = 'otp-sensitive-value';
    const recipient = 'private.recipient@gmail.com';
    const { AuthMailer, fetchMock, logger, logs } = await loadMailerForTest({
      NODE_ENV: 'production',
      BREVO_API_KEY: apiKey,
      EMAIL_FROM: 'no-reply@example.com',
      AUTH_OTP_TTL_MINUTES: 10,
    });

    const mailer = new AuthMailer(logger);
    const result = await mailer.sendEmailVerificationOtp({
      email: recipient,
      username: 'alice',
      otp,
    });

    expect(result).toEqual({ otpSent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('api-key')).toBe(apiKey);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { email: 'no-reply@example.com' },
      to: [{ email: recipient }],
      subject: 'OCTOPUS verification code',
      htmlContent: `<p>Hello alice,</p><p>Your OCTOPUS verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });
    expect(logs.map(({ message }) => message)).toEqual([
      'OTP email send started',
      'OTP email send completed',
    ]);

    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain('provider":"brevo');
    expect(serializedLogs).toContain('transport":"https');
    expect(serializedLogs).toContain('gmail.com');
    expect(serializedLogs).not.toContain(apiKey);
    expect(serializedLogs).not.toContain(otp);
    expect(serializedLogs).not.toContain('private.recipient');
    expect(serializedLogs).not.toContain('Hello alice');
  });

  it('logs safe Brevo API failure metadata and returns the generic production error', async () => {
    const apiKey = 'brevo-api-key-sensitive';
    const { AuthMailer, logger, logs } = await loadMailerForTest(
      {
        NODE_ENV: 'production',
        BREVO_API_KEY: apiKey,
        EMAIL_FROM: 'no-reply@example.com',
      },
      async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'invalid_parameter',
          message: `Rejected ${apiKey} otp-sensitive-value private.recipient@gmail.com`,
        }),
      }) as Response,
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
        provider: 'brevo',
        transport: 'https',
        recipientDomain: 'gmail.com',
        httpStatus: 401,
        providerErrorCode: 'invalid_parameter',
      },
    });
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain(apiKey);
    expect(serializedLogs).not.toContain('otp-sensitive-value');
    expect(serializedLogs).not.toContain('private.recipient');
    expect(serializedLogs).not.toContain('Rejected');
  });

  it('aborts the HTTPS request after ten seconds and keeps the generic production error', async () => {
    vi.useFakeTimers();
    const apiKey = 'brevo-api-key-sensitive';
    const { AuthMailer, logger, logs } = await loadMailerForTest(
      {
        NODE_ENV: 'production',
        BREVO_API_KEY: apiKey,
        EMAIL_FROM: 'no-reply@example.com',
      },
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }) as Promise<Response>,
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

    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(logs.at(-1)).toMatchObject({
      level: 'error',
      message: 'OTP email send timed out',
      bindings: {
        provider: 'brevo',
        transport: 'https',
        errorCode: 'BREVO_HTTP_TIMEOUT',
        elapsedMs: 10_000,
      },
    });
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain(apiKey);
    expect(serializedLogs).not.toContain('123456');
  });

  it('uses the development OTP fallback when the Brevo API key is absent outside production', async () => {
    const { AuthMailer, fetchMock } = await loadMailerForTest({
      NODE_ENV: 'development',
      EMAIL_FROM: 'no-reply@example.com',
    });

    const mailer = new AuthMailer();
    const result = await mailer.sendEmailVerificationOtp({
      email: 'alice@gmail.com',
      username: 'alice',
      otp: '654321',
    });

    expect(result).toEqual({
      otpSent: true,
      developmentOtp: '654321',
      deliveryMode: 'DEVELOPMENT_FALLBACK',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires Brevo API configuration in production', async () => {
    const { AuthMailer, fetchMock } = await loadMailerForTest({
      NODE_ENV: 'production',
      EMAIL_FROM: 'no-reply@example.com',
    });

    const mailer = new AuthMailer();
    await expect(
      mailer.sendEmailVerificationOtp({
        email: 'alice@gmail.com',
        username: 'alice',
        otp: '000111',
      }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'EMAIL_PROVIDER_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
