import { z } from 'zod';
export * from './snapshots.js';
export * from './secrets.js';
export * from './projects.js';
export * from './octo.js';

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const apiSuccessSchema = z.object({
  success: z.literal(true),
  data: z.unknown().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
export type ApiSuccessResponse<T = unknown> = {
  success: true;
  data: T;
};

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export const ENV_MODES = ['development', 'test', 'production'] as const;
export type EnvMode = (typeof ENV_MODES)[number];
