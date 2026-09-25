import { z } from 'zod';

import type { OctoPageContext } from './octo.types.js';

export const octoPageContextSchema = z.enum([
  'DASHBOARD',
  'PROJECTS',
  'PROJECT_DETAILS',
  'SNAPSHOT',
  'BLUEPRINT',
  'SECRET_VAULT',
  'SETTINGS',
] as const satisfies readonly OctoPageContext[]);

export const octoRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  pageContext: octoPageContextSchema,
  projectId: z.string().uuid().optional(),
  snapshotId: z.string().uuid().optional(),
});

export type OctoRequestPayload = z.infer<typeof octoRequestSchema>;

export const octoResponseSchema = z.object({
  reply: z.string(),
  intent: z.string(),
  suggestions: z.array(z.string()),
  summary: z.object({
    greeting: z.string(),
    projectCount: z.number().nonnegative(),
    snapshotCount: z.number().nonnegative(),
    suggestions: z.array(z.string()),
  }),
});

export type OctoResponsePayload = z.infer<typeof octoResponseSchema>;
