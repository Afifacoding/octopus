import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { HttpError } from '../errors/http-error.js';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Invalid request payload',
        },
      });
    }

    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (typeof (error as { statusCode?: unknown }).statusCode === 'number') {
      const statusCode = (error as { statusCode: number }).statusCode;

      if (statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid request',
          },
        });
      }
    }

    app.log.error({ err: error }, 'Unhandled error');

    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
      },
    });
  });
}
