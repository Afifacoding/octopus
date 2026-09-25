import { HttpError } from '../../core/errors/http-error.js';
import { env } from '../../config/env.js';
import {
  generateOtpCode,
  generateSessionToken,
  hashOtp,
  hashPassword,
  hashSessionToken,
  hoursFromNow,
  minutesFromNow,
  normalizeEmail,
  normalizeUsername,
  secondsFromNow,
  verifyPassword,
} from './auth.utils.js';
import { AuthMailer, type OtpDeliveryResult } from './auth.mailer.js';
import { AuthRepository } from './auth.repository.js';
import type {
  ExtensionConnectionStatus,
  LoginInput,
  OtpDeliveryMetadata,
  PublicUser,
  RequestOtpInput,
  SessionContext,
  SignupInput,
  UpdateProfileInput,
  VerifyOtpInput,
} from './auth.types.js';

const EXTENSION_USER_AGENT_MARKER = 'octopus-vscode-extension';

// Extension sends a heartbeat every ~60s; anything older means the extension is no longer active.
const EXTENSION_CONNECTION_FRESHNESS_MS = 3 * 60 * 1000;

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly mailer: AuthMailer,
  ) {}

  async signup(input: SignupInput): Promise<{ user: PublicUser } & OtpDeliveryMetadata> {
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);

    const [existingByEmail, existingByUsername] = await Promise.all([
      this.repository.findUserByEmail(email),
      this.repository.findUserByUsername(username),
    ]);

    if (existingByEmail || existingByUsername) {
      throw new HttpError(409, 'ACCOUNT_EXISTS', 'Unable to create account with these credentials');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await this.repository.createPendingUser({
      username,
      email,
      passwordHash,
    });

    const otpDelivery = await this.issueVerificationOtp(user.id, user.email, user.username);

    await this.repository.createAuditLog({
      userId: user.id,
      action: 'AUTH_SIGNUP_CREATED',
    });

    return {
      user: this.repository.toPublicUser(user),
      otpSent: true,
      ...('deliveryMode' in otpDelivery
        ? {
            developmentOtp: otpDelivery.developmentOtp,
            deliveryMode: otpDelivery.deliveryMode,
          }
        : {}),
    };
  }

  async requestOtp(input: RequestOtpInput) {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      return { otpSent: true } as const;
    }

    if (user.emailVerifiedAt) {
      return { otpSent: true } as const;
    }

    const latestChallenge = await this.repository.findLatestOtpChallenge(user.id);
    const now = new Date();

    if (
      latestChallenge &&
      !latestChallenge.consumedAt &&
      !latestChallenge.invalidatedAt &&
      latestChallenge.resendAvailableAt > now
    ) {
      throw new HttpError(429, 'OTP_RESEND_LIMIT', 'Please wait before requesting another OTP');
    }

    const otpDelivery = await this.issueVerificationOtp(user.id, user.email, user.username);

    await this.repository.createAuditLog({
      userId: user.id,
      action: 'AUTH_OTP_RESENT',
    });

    return {
      otpSent: true,
      ...('deliveryMode' in otpDelivery
        ? {
            developmentOtp: otpDelivery.developmentOtp,
            deliveryMode: otpDelivery.deliveryMode,
          }
        : {}),
    } as const;
  }

  async verifyOtp(input: VerifyOtpInput) {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      throw new HttpError(400, 'OTP_INVALID', 'Invalid verification code');
    }

    if (user.emailVerifiedAt) {
      throw new HttpError(400, 'OTP_INVALID', 'Invalid verification code');
    }

    const challenge = await this.repository.findLatestOtpChallenge(user.id);

    if (!challenge || challenge.invalidatedAt || challenge.consumedAt) {
      throw new HttpError(400, 'OTP_INVALID', 'Invalid verification code');
    }

    if (challenge.expiresAt <= new Date()) {
      throw new HttpError(400, 'OTP_EXPIRED', 'Verification code has expired');
    }

    if (challenge.attemptCount >= challenge.maxAttempts) {
      throw new HttpError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many verification attempts');
    }

    const otpHash = hashOtp(input.otp);

    if (otpHash !== challenge.otpHash) {
      await this.repository.incrementOtpAttempt(challenge.id);
      throw new HttpError(400, 'OTP_INVALID', 'Invalid verification code');
    }

    await this.repository.consumeOtpChallenge(challenge.id);
    const verifiedUser = await this.repository.markEmailVerified(user.id);

    await this.repository.createAuditLog({
      userId: verifiedUser.id,
      action: 'AUTH_EMAIL_VERIFIED',
    });

    return {
      verified: true,
      user: this.repository.toPublicUser(verifiedUser),
    } as const;
  }

  async login(input: LoginInput, metadata: { ipAddress?: string; userAgent?: string; clientIdentifier?: string }) {
    const identifier = input.emailOrUsername.trim().toLowerCase();
    const user = await this.repository.findUserByEmailOrUsername(identifier);

    if (!user) {
      throw new HttpError(401, 'AUTH_INVALID', 'Invalid credentials');
    }

    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new HttpError(401, 'AUTH_INVALID', 'Invalid credentials');
    }

    if (!user.emailVerifiedAt) {
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Email verification is required');
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = hoursFromNow(env.AUTH_SESSION_TTL_HOURS);
    const resolvedUserAgent = this.resolveSessionUserAgent(metadata);

    const sessionMetadata = {
      ...(typeof metadata.ipAddress === 'string' ? { ipAddress: metadata.ipAddress } : {}),
      ...(typeof resolvedUserAgent === 'string' ? { userAgent: resolvedUserAgent } : {}),
    };

    const session = await this.repository.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
      ...sessionMetadata,
    });

    await this.repository.createAuditLog({
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
    });

    return {
      session: {
        sessionId: session.id,
        userId: user.id,
        token,
        expiresAt,
      } satisfies SessionContext,
      user: this.repository.toPublicUser(user),
    };
  }

  private resolveSessionUserAgent(metadata: { userAgent?: string; clientIdentifier?: string }) {
    const userAgent = typeof metadata.userAgent === 'string' ? metadata.userAgent.trim() : '';
    const clientIdentifier =
      typeof metadata.clientIdentifier === 'string' ? metadata.clientIdentifier.trim().toLowerCase() : '';

    if (clientIdentifier !== 'vscode-extension') {
      return userAgent.length > 0 ? userAgent : undefined;
    }

    if (userAgent.toLowerCase().includes(EXTENSION_USER_AGENT_MARKER)) {
      return userAgent;
    }

    return userAgent.length > 0 ? `${userAgent} ${EXTENSION_USER_AGENT_MARKER}` : EXTENSION_USER_AGENT_MARKER;
  }

  async logout(token: string) {
    await this.repository.revokeSessionByTokenHash(hashSessionToken(token));
    return { loggedOut: true } as const;
  }

  async getCurrentUserBySessionToken(token: string) {
    const session = await this.repository.findActiveSessionByTokenHash(hashSessionToken(token));

    if (!session) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
    }

    if (session.revokedAt || session.expiresAt <= new Date()) {
      throw new HttpError(401, 'SESSION_EXPIRED', 'Session has expired');
    }

    await this.repository.updateSessionLastSeen(session.id);

    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        username: session.user.username,
        email: session.user.email,
        emailVerified: Boolean(session.user.emailVerifiedAt),
      },
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    if (input.username) {
      const normalizedUsername = normalizeUsername(input.username);
      const existing = await this.repository.findUserByUsername(normalizedUsername);
      if (existing && existing.id !== userId) {
        throw new HttpError(409, 'USERNAME_EXISTS', 'Username is already in use');
      }

      const updated = await this.repository.updateProfile(userId, {
        username: normalizedUsername,
      });

      await this.repository.createAuditLog({
        userId,
        action: 'AUTH_PROFILE_UPDATED',
      });

      return this.repository.toPublicUser(updated);
    }

    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    }

    return this.repository.toPublicUser(user);
  }

  async verifyCurrentUserPassword(userId: string, password: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    }

    return verifyPassword(password, user.passwordHash);
  }

  async getExtensionConnectionStatus(userId: string): Promise<ExtensionConnectionStatus> {
    const session = await this.repository.findLatestActiveExtensionSessionByUserId(userId);

    if (!session) {
      return this.disconnectedExtensionStatus();
    }

    const lastActivityAt = session.lastSeenAt ?? session.createdAt;
    const isRecentlyActive = Date.now() - lastActivityAt.getTime() <= EXTENSION_CONNECTION_FRESHNESS_MS;

    if (!isRecentlyActive) {
      return this.disconnectedExtensionStatus();
    }

    const latestSnapshot = await this.repository.findLatestExtensionSnapshotByUserId(userId);
    const workspaceName = this.getWorkspaceNameFromMetadata(latestSnapshot?.captureMetadata ?? null);

    return {
      connected: true,
      status: 'CONNECTED',
      workspaceName,
      projectId: latestSnapshot?.project.id ?? null,
      projectName: latestSnapshot?.project.name ?? null,
      sessionLastSeenAt: lastActivityAt.toISOString(),
    };
  }

  private disconnectedExtensionStatus(): ExtensionConnectionStatus {
    return {
      connected: false,
      status: 'NOT_CONNECTED',
      workspaceName: null,
      projectId: null,
      projectName: null,
      sessionLastSeenAt: null,
    };
  }

  private async issueVerificationOtp(userId: string, email: string, username: string): Promise<OtpDeliveryResult> {
    await this.repository.invalidateActiveOtpChallenges(userId);

    const otp = generateOtpCode();

    await this.repository.createOtpChallenge({
      userId,
      otpHash: hashOtp(otp),
      expiresAt: minutesFromNow(env.AUTH_OTP_TTL_MINUTES),
      maxAttempts: env.AUTH_OTP_MAX_ATTEMPTS,
      resendAvailableAt: secondsFromNow(env.AUTH_OTP_RESEND_COOLDOWN_SECONDS),
    });

    return this.mailer.sendEmailVerificationOtp({
      email,
      username,
      otp,
    });
  }

  private getWorkspaceNameFromMetadata(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const roots = (metadata as { workspaceRoots?: unknown }).workspaceRoots;
    if (!Array.isArray(roots)) {
      return null;
    }

    const first = roots.find((item) => typeof item === 'string' && item.trim().length > 0);
    return typeof first === 'string' ? first : null;
  }
}
