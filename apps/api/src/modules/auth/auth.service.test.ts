import { describe, expect, it, beforeEach } from 'vitest';

import type { OtpDeliveryResult } from './auth.mailer.js';
import { AuthService } from './auth.service.js';

type UserRecord = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  status: 'PENDING' | 'ACTIVE';
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type OtpRecord = {
  id: string;
  userId: string;
  otpHash: string;
  expiresAt: Date;
  attemptCount: number;
  maxAttempts: number;
  resendAvailableAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
};

type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  lastSeenAt: Date | null;
};

class FakeAuthRepository {
  users: UserRecord[] = [];
  otps: OtpRecord[] = [];
  sessions: SessionRecord[] = [];
  latestExtensionSnapshot: {
    project: { id: string; name: string };
    captureMetadata: Record<string, unknown> | null;
  } | null = null;

  async findUserById(id: string) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async findUserByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findUserByUsername(username: string) {
    return this.users.find((user) => user.username === username) ?? null;
  }

  async findUserByEmailOrUsername(identifier: string) {
    return this.users.find((user) => user.email === identifier || user.username === identifier) ?? null;
  }

  async createPendingUser(input: { username: string; email: string; passwordHash: string }) {
    const user: UserRecord = {
      id: `user_${this.users.length + 1}`,
      username: input.username,
      email: input.email,
      passwordHash: input.passwordHash,
      status: 'PENDING',
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  async markEmailVerified(userId: string) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error('Missing user');
    }

    user.emailVerifiedAt = new Date();
    user.status = 'ACTIVE';
    user.updatedAt = new Date();
    return user;
  }

  async invalidateActiveOtpChallenges(userId: string) {
    for (const challenge of this.otps) {
      if (
        challenge.userId === userId &&
        !challenge.consumedAt &&
        !challenge.invalidatedAt &&
        challenge.expiresAt > new Date()
      ) {
        challenge.invalidatedAt = new Date();
      }
    }
  }

  async createOtpChallenge(input: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
    maxAttempts: number;
    resendAvailableAt: Date;
  }) {
    const otp: OtpRecord = {
      id: `otp_${this.otps.length + 1}`,
      userId: input.userId,
      otpHash: input.otpHash,
      expiresAt: input.expiresAt,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      resendAvailableAt: input.resendAvailableAt,
      consumedAt: null,
      invalidatedAt: null,
      createdAt: new Date(),
    };

    this.otps.push(otp);
    return otp;
  }

  async findLatestOtpChallenge(userId: string) {
    const records = this.otps
      .filter((challenge) => challenge.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return records[0] ?? null;
  }

  async incrementOtpAttempt(challengeId: string) {
    const challenge = this.otps.find((item) => item.id === challengeId);
    if (!challenge) {
      throw new Error('Missing challenge');
    }

    challenge.attemptCount += 1;
    return challenge;
  }

  async consumeOtpChallenge(challengeId: string) {
    const challenge = this.otps.find((item) => item.id === challengeId);
    if (!challenge) {
      throw new Error('Missing challenge');
    }

    challenge.consumedAt = new Date();
    return challenge;
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }) {
    const session: SessionRecord = {
      id: `session_${this.sessions.length + 1}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
      lastSeenAt: null,
    };

    if (typeof input.userAgent === 'string') {
      session.userAgent = input.userAgent;
    }

    if (typeof input.ipAddress === 'string') {
      session.ipAddress = input.ipAddress;
    }

    this.sessions.push(session);
    return session;
  }

  async findActiveSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.find((item) => item.tokenHash === tokenHash) ?? null;
    if (!session) {
      return null;
    }

    const user = this.users.find((item) => item.id === session.userId);
    if (!user) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }

  async revokeSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.find((item) => item.tokenHash === tokenHash);
    if (session) {
      session.revokedAt = new Date();
    }
  }

  async updateSessionLastSeen(sessionId: string) {
    const session = this.sessions.find((item) => item.id === sessionId);
    if (session) {
      session.lastSeenAt = new Date();
    }
  }

  async findLatestActiveExtensionSessionByUserId(userId: string) {
    const now = new Date();
    const active = this.sessions
      .filter(
        (item) =>
          item.userId === userId &&
          !item.revokedAt &&
          item.expiresAt > now &&
          typeof item.userAgent === 'string' &&
          item.userAgent.toLowerCase().includes('octopus-vscode-extension'),
      )
      .sort((a, b) => (b.lastSeenAt?.getTime() ?? b.createdAt.getTime()) - (a.lastSeenAt?.getTime() ?? a.createdAt.getTime()));

    const session = active[0];
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    };
  }

  async findLatestExtensionSnapshotByUserId(_userId: string) {
    return this.latestExtensionSnapshot;
  }

  async updateProfile(userId: string, data: { username?: string }) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error('Missing user');
    }

    if (typeof data.username === 'string') {
      user.username = data.username;
    }

    user.updatedAt = new Date();
    return user;
  }

  async createAuditLog() {
    return;
  }

  toPublicUser(user: UserRecord) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt.toISOString(),
    };
  }
}

class FakeMailer {
  lastOtp: { email: string; username: string; otp: string } | null = null;
  useDevelopmentFallback = false;

  async sendEmailVerificationOtp(input: { email: string; username: string; otp: string }) {
    this.lastOtp = input;

    if (this.useDevelopmentFallback) {
      return {
        otpSent: true,
        developmentOtp: input.otp,
        deliveryMode: 'DEVELOPMENT_FALLBACK',
      } satisfies OtpDeliveryResult;
    }

    return {
      otpSent: true,
    } satisfies OtpDeliveryResult;
  }
}

describe('AuthService', () => {
  let repository: FakeAuthRepository;
  let mailer: FakeMailer;
  let service: AuthService;

  beforeEach(() => {
    repository = new FakeAuthRepository();
    mailer = new FakeMailer();
    service = new AuthService(repository as never, mailer as never);
  });

  it('supports valid signup', async () => {
    const result = await service.signup({
      username: 'Alice_01',
      email: 'alice@gmail.com',
      password: 'SecurePass123',
    });

    expect(result.otpSent).toBe(true);
    expect(result.user.email).toBe('alice@gmail.com');
    expect(mailer.lastOtp?.email).toBe('alice@gmail.com');
  });

  it('supports signup with development OTP fallback metadata', async () => {
    mailer.useDevelopmentFallback = true;

    const result = await service.signup({
      username: 'DevUser',
      email: 'devuser@gmail.com',
      password: 'SecurePass123',
    });

    expect(result.otpSent).toBe(true);
    expect(result.deliveryMode).toBe('DEVELOPMENT_FALLBACK');
    expect(result.developmentOtp).toBe(mailer.lastOtp?.otp);
  });

  it('rejects duplicate email signup', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    await expect(
      service.signup({ username: 'alice2', email: 'alice@gmail.com', password: 'SecurePass123' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
  });

  it('rejects duplicate username signup', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    await expect(
      service.signup({ username: 'alice', email: 'alice2@gmail.com', password: 'SecurePass123' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
  });

  it('verifies a valid OTP', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;

    expect(otp).toBeTruthy();

    const result = await service.verifyOtp({ email: 'alice@gmail.com', otp: otp! });
    expect(result.verified).toBe(true);
  });

  it('rejects invalid OTP', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    await expect(service.verifyOtp({ email: 'alice@gmail.com', otp: '000000' })).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('rejects expired OTP', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const challenge = await repository.findLatestOtpChallenge('user_1');
    if (!challenge) {
      throw new Error('missing challenge');
    }

    challenge.expiresAt = new Date(Date.now() - 1);

    await expect(service.verifyOtp({ email: 'alice@gmail.com', otp: '111111' })).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('rejects reused OTP', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }

    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await expect(service.verifyOtp({ email: 'alice@gmail.com', otp })).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('enforces OTP attempt limit', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const challenge = await repository.findLatestOtpChallenge('user_1');
    if (!challenge) {
      throw new Error('missing challenge');
    }

    challenge.attemptCount = challenge.maxAttempts;

    await expect(service.verifyOtp({ email: 'alice@gmail.com', otp: '000000' })).rejects.toMatchObject({
      code: 'OTP_ATTEMPTS_EXCEEDED',
    });
  });

  it('enforces OTP resend cooldown', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    await expect(service.requestOtp({ email: 'alice@gmail.com' })).rejects.toMatchObject({
      code: 'OTP_RESEND_LIMIT',
    });
  });

  it('supports valid login for verified users', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    const login = await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      {},
    );

    expect(login.user.email).toBe('alice@gmail.com');
    expect(login.session.token).toHaveLength(64);
  });

  it('rejects invalid login credentials', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    await expect(
      service.login({ emailOrUsername: 'alice@gmail.com', password: 'wrong-pass' }, {}),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID' });
  });

  it('rejects login for unverified users', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    await expect(
      service.login({ emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' }, {}),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('rejects protected access without session', async () => {
    await expect(service.getCurrentUserBySessionToken('missing-token')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('supports valid session and rejects expired session', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    const login = await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      {},
    );

    const current = await service.getCurrentUserBySessionToken(login.session.token);
    expect(current.user.email).toBe('alice@gmail.com');

    const session = repository.sessions.find((item) => item.id === login.session.sessionId);
    if (!session) {
      throw new Error('missing session');
    }
    session.expiresAt = new Date(Date.now() - 1);

    await expect(service.getCurrentUserBySessionToken(login.session.token)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('invalidates session on logout', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    const login = await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      {},
    );

    await service.logout(login.session.token);

    await expect(service.getCurrentUserBySessionToken(login.session.token)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('prevents profile username collision with another user', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    await service.signup({ username: 'bob', email: 'bob@gmail.com', password: 'SecurePass123' });

    await expect(service.updateProfile('user_2', { username: 'alice' })).rejects.toMatchObject({
      code: 'USERNAME_EXISTS',
    });
  });

  it('updates profile for authenticated owner', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    const updated = await service.updateProfile('user_1', { username: 'alice_new' });
    expect(updated.username).toBe('alice_new');
  });

  it('returns disconnected extension status without active extension session', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(false);
    expect(status.status).toBe('NOT_CONNECTED');
    expect(status.projectId).toBeNull();
  });

  it('marks login as extension session when client identifier is vscode-extension', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }

    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'PowerShell-Client', clientIdentifier: 'vscode-extension' },
    );

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(true);
    expect(status.status).toBe('CONNECTED');
  });

  it('returns connected extension status with workspace metadata from latest extension snapshot', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }

    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    repository.latestExtensionSnapshot = {
      project: { id: 'project_1', name: 'octo' },
      captureMetadata: {
        workspaceRoots: ['octo'],
      },
    };

    const status = await service.getExtensionConnectionStatus('user_1');

    expect(status.connected).toBe(true);
    expect(status.status).toBe('CONNECTED');
    expect(status.workspaceName).toBe('octo');
    expect(status.projectId).toBe('project_1');
    expect(status.projectName).toBe('octo');
    expect(status.sessionLastSeenAt).toBeTruthy();
  });

  it('treats a recent heartbeat as connected', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    const session = repository.sessions[0];
    if (!session) {
      throw new Error('missing session');
    }
    session.lastSeenAt = new Date(Date.now() - 30 * 1000);

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(true);
    expect(status.status).toBe('CONNECTED');
  });

  it('treats a session with no heartbeat in over 3 minutes as not connected', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    const session = repository.sessions[0];
    if (!session) {
      throw new Error('missing session');
    }
    session.lastSeenAt = new Date(Date.now() - 4 * 60 * 1000);

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(false);
    expect(status.status).toBe('NOT_CONNECTED');
    expect(status.projectId).toBeNull();
    expect(status.workspaceName).toBeNull();
  });

  it('falls back to createdAt for freshness when the extension has never sent a heartbeat', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    const session = repository.sessions[0];
    if (!session) {
      throw new Error('missing session');
    }
    // lastSeenAt stays null until the first heartbeat; a freshly created session must still count as connected.
    expect(session.lastSeenAt).toBeNull();

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(true);

    session.createdAt = new Date(Date.now() - 4 * 60 * 1000);
    const staleStatus = await service.getExtensionConnectionStatus('user_1');
    expect(staleStatus.connected).toBe(false);
  });

  it('treats an expired session as not connected regardless of a recent lastSeenAt', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    const session = repository.sessions[0];
    if (!session) {
      throw new Error('missing session');
    }
    session.lastSeenAt = new Date();
    session.expiresAt = new Date(Date.now() - 1000);

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(false);
    expect(status.status).toBe('NOT_CONNECTED');
  });

  it('treats a revoked session as not connected regardless of a recent lastSeenAt', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    const session = repository.sessions[0];
    if (!session) {
      throw new Error('missing session');
    }
    session.lastSeenAt = new Date();
    session.revokedAt = new Date();

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(false);
    expect(status.status).toBe('NOT_CONNECTED');
  });

  it('does not count a plain web login session as VS Code connected', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' },
    );

    const status = await service.getExtensionConnectionStatus('user_1');
    expect(status.connected).toBe(false);
    expect(status.status).toBe('NOT_CONNECTED');
  });

  it('updates lastSeenAt on heartbeat and restores connected status after a stale period', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const otp = mailer.lastOtp?.otp;
    if (!otp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp });

    const loginResult = await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    const session = repository.sessions[0];
    if (!session) {
      throw new Error('missing session');
    }
    session.lastSeenAt = new Date(Date.now() - 4 * 60 * 1000);

    const staleStatus = await service.getExtensionConnectionStatus('user_1');
    expect(staleStatus.connected).toBe(false);

    // Simulate the extension's heartbeat hitting /auth/me with its session token.
    await service.getCurrentUserBySessionToken(loginResult.session.token);

    expect(session.lastSeenAt!.getTime()).toBeGreaterThan(Date.now() - 1000);

    const refreshedStatus = await service.getExtensionConnectionStatus('user_1');
    expect(refreshedStatus.connected).toBe(true);
    expect(refreshedStatus.status).toBe('CONNECTED');
  });

  it('does not leak one user extension connection status to another user', async () => {
    await service.signup({ username: 'alice', email: 'alice@gmail.com', password: 'SecurePass123' });
    const aliceOtp = mailer.lastOtp?.otp;
    if (!aliceOtp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'alice@gmail.com', otp: aliceOtp });
    await service.login(
      { emailOrUsername: 'alice@gmail.com', password: 'SecurePass123' },
      { userAgent: 'octopus-vscode-extension' },
    );

    await service.signup({ username: 'bob', email: 'bob@gmail.com', password: 'SecurePass123' });
    const bobOtp = mailer.lastOtp?.otp;
    if (!bobOtp) {
      throw new Error('missing otp');
    }
    await service.verifyOtp({ email: 'bob@gmail.com', otp: bobOtp });

    const aliceStatus = await service.getExtensionConnectionStatus('user_1');
    const bobStatus = await service.getExtensionConnectionStatus('user_2');

    expect(aliceStatus.connected).toBe(true);
    expect(bobStatus.connected).toBe(false);
    expect(bobStatus.status).toBe('NOT_CONNECTED');
  });
});
