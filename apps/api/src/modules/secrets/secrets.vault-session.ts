import { createHmac } from 'node:crypto';

import type { FastifyReply } from 'fastify';

import { env } from '../../config/env.js';

type VaultSessionPayload = {
  userId: string;
  projectId: string;
  exp: number;
};

export const VAULT_SESSION_COOKIE_NAME = 'octopus_vault_session';

function toBase64Url(input: Buffer | string) {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer.toString('base64url');
}

function fromBase64Url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signPayload(payload: string) {
  return createHmac('sha256', env.AUTH_SESSION_SECRET).update(payload).digest('base64url');
}

export function createVaultSessionToken(input: { userId: string; projectId: string; ttlSeconds?: number }) {
  const ttlSeconds = input.ttlSeconds ?? env.SECRET_VAULT_SESSION_TTL_SECONDS;
  const exp = Date.now() + ttlSeconds * 1000;

  const payload: VaultSessionPayload = {
    userId: input.userId,
    projectId: input.projectId,
    exp,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  const token = `${encodedPayload}.${signature}`;

  return {
    token,
    expiresAt: new Date(exp),
  };
}

export function readVaultSessionToken(token: string): VaultSessionPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = signPayload(encodedPayload);
  if (signature !== expected) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as VaultSessionPayload;
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.projectId !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    if (parsed.exp <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function setVaultSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(VAULT_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearVaultSessionCookie(reply: FastifyReply) {
  reply.clearCookie(VAULT_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
