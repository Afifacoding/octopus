import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../../core/errors/http-error.js';
import {
  loginSchema,
  requestOtpSchema,
  signupSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from './auth.schemas.js';
import { clearSessionCookie, setSessionCookie, SESSION_COOKIE_NAME } from './auth.cookies.js';
import { clearVaultSessionCookie } from '../secrets/secrets.vault-session.js';
import type { AuthService } from './auth.service.js';

export function createAuthController(service: AuthService) {
  return {
    signup: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = signupSchema.parse(request.body);
      const result = await service.signup(input);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    },

    requestOtp: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = requestOtpSchema.parse(request.body);
      const result = await service.requestOtp(input);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },

    verifyOtp: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = verifyOtpSchema.parse(request.body);
      const result = await service.verifyOtp(input);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },

    login: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = loginSchema.parse(request.body);
      const extensionClientHeader = request.headers['x-octopus-client'];
      const clientIdentifier =
        typeof extensionClientHeader === 'string'
          ? extensionClientHeader
          : Array.isArray(extensionClientHeader)
            ? extensionClientHeader[0]
            : undefined;
      const metadata = {
        ipAddress: request.ip,
        ...(typeof request.headers['user-agent'] === 'string'
          ? { userAgent: request.headers['user-agent'] }
          : {}),
        ...(typeof clientIdentifier === 'string' ? { clientIdentifier } : {}),
      };
      const result = await service.login(input, {
        ...metadata,
      });

      setSessionCookie(reply, result.session.token, result.session.expiresAt);

      return reply.status(200).send({
        success: true,
        data: {
          user: result.user,
          emailVerified: result.user.emailVerified,
        },
      });
    },

    logout: async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.cookies[SESSION_COOKIE_NAME];
      if (token) {
        await service.logout(token);
      }

      clearSessionCookie(reply);
      clearVaultSessionCookie(reply);

      return reply.status(200).send({
        success: true,
        data: {
          loggedOut: true,
        },
      });
    },

    me: async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.cookies[SESSION_COOKIE_NAME];
      if (!token) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const result = await service.getCurrentUserBySessionToken(token);

      return reply.status(200).send({
        success: true,
        data: {
          user: result.user,
        },
      });
    },

    updateProfile: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const input = updateProfileSchema.parse(request.body);
      const updateInput = {
        ...(typeof input.username === 'string' ? { username: input.username } : {}),
      };
      const user = await service.updateProfile(request.auth.userId, updateInput);

      return reply.status(200).send({
        success: true,
        data: {
          user,
        },
      });
    },

    extensionConnection: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required');
      }

      const status = await service.getExtensionConnectionStatus(request.auth.userId);

      return reply.status(200).send({
        success: true,
        data: status,
      });
    },
  };
}
