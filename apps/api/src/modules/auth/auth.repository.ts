import type { Prisma, User } from '@prisma/client';

import { prisma } from '../../db/client.js';

export type ActiveSessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: {
    id: string;
    username: string;
    email: string;
    emailVerifiedAt: Date | null;
  };
};

export type ActiveExtensionSessionRecord = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
};

export type LatestExtensionSnapshotRecord = {
  project: {
    id: string;
    name: string;
  };
  captureMetadata: Prisma.JsonValue | null;
};

export class AuthRepository {
  async findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  }

  async findUserByEmailOrUsername(emailOrUsername: string) {
    return prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
      },
    });
  }

  async createPendingUser(input: { username: string; email: string; passwordHash: string }) {
    return prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
      },
    });
  }

  async markEmailVerified(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    });
  }

  async invalidateActiveOtpChallenges(userId: string) {
    await prisma.emailOtpChallenge.updateMany({
      where: {
        userId,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        invalidatedAt: new Date(),
      },
    });
  }

  async createOtpChallenge(input: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
    maxAttempts: number;
    resendAvailableAt: Date;
  }) {
    return prisma.emailOtpChallenge.create({
      data: {
        userId: input.userId,
        otpHash: input.otpHash,
        expiresAt: input.expiresAt,
        maxAttempts: input.maxAttempts,
        resendAvailableAt: input.resendAvailableAt,
      },
    });
  }

  async findLatestOtpChallenge(userId: string) {
    return prisma.emailOtpChallenge.findFirst({
      where: {
        userId,
        purpose: 'EMAIL_VERIFICATION',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async incrementOtpAttempt(challengeId: string) {
    return prisma.emailOtpChallenge.update({
      where: { id: challengeId },
      data: {
        attemptCount: {
          increment: 1,
        },
      },
    });
  }

  async consumeOtpChallenge(challengeId: string) {
    return prisma.emailOtpChallenge.update({
      where: { id: challengeId },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }) {
    const data = {
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      ...(typeof input.userAgent === 'string' ? { userAgent: input.userAgent } : {}),
      ...(typeof input.ipAddress === 'string' ? { ipAddress: input.ipAddress } : {}),
    };

    return prisma.authSession.create({
      data,
    });
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<ActiveSessionRecord | null> {
    return prisma.authSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            emailVerifiedAt: true,
          },
        },
      },
    });
  }

  async findLatestActiveExtensionSessionByUserId(userId: string): Promise<ActiveExtensionSessionRecord | null> {
    return prisma.authSession.findFirst({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        userAgent: {
          contains: 'octopus-vscode-extension',
          mode: 'insensitive',
        },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
  }

  async findLatestExtensionSnapshotByUserId(userId: string): Promise<LatestExtensionSnapshotRecord | null> {
    return prisma.snapshot.findFirst({
      where: {
        captureSource: 'EXTENSION',
        project: {
          ownerId: userId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        captureMetadata: true,
      },
    });
  }

  async revokeSessionByTokenHash(tokenHash: string) {
    await prisma.authSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async updateSessionLastSeen(sessionId: string) {
    await prisma.authSession.update({
      where: { id: sessionId },
      data: {
        lastSeenAt: new Date(),
      },
    });
  }

  async updateProfile(userId: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async createAuditLog(input: {
    userId?: string;
    action: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const data = {
      action: input.action,
      ...(typeof input.userId === 'string' ? { userId: input.userId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    await prisma.auditLog.create({
      data,
    });
  }

  toPublicUser(user: User & { emailVerifiedAt: Date | null }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt.toISOString(),
    };
  }
}
