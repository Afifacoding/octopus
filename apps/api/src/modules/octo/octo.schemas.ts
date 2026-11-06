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

// Project and snapshot IDs are Prisma cuid() values, not UUIDs.
const resourceIdSchema = z.string().min(1).max(128);

export const octoRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  pageContext: octoPageContextSchema,
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).max(12).optional(),
  mode: z.enum(['learn', 'debug', 'dsa', 'code-review', 'interview', 'project-assistant']).optional(),
  images: z.array(z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i).max(1_500_000)).max(1).optional(),
  projectId: resourceIdSchema.optional(),
  snapshotId: resourceIdSchema.optional(),
  compare: z.object({
    baseSnapshotId: resourceIdSchema,
    targetSnapshotId: resourceIdSchema,
  }).optional(),
}).superRefine((value, context) => {
  if (!value.compare) return;
  if (!value.projectId) {
    context.addIssue({ code: 'custom', path: ['projectId'], message: 'Select a project to compare snapshots' });
  }
  if (value.compare.baseSnapshotId === value.compare.targetSnapshotId) {
    context.addIssue({ code: 'custom', path: ['compare'], message: 'Choose two different snapshots to compare' });
  }
});

export const octoProjectParamsSchema = z.object({
  projectId: resourceIdSchema,
});

export const octoSnapshotParamsSchema = z.object({
  projectId: resourceIdSchema,
  snapshotId: resourceIdSchema,
});

export const octoCompareQuerySchema = z.object({
  baseSnapshotId: resourceIdSchema,
  targetSnapshotId: resourceIdSchema,
}).refine((value) => value.baseSnapshotId !== value.targetSnapshotId, {
  message: 'Choose two different snapshots to compare',
  path: ['targetSnapshotId'],
});

export const octoGraphQuerySchema = z.object({
  projectId: resourceIdSchema,
  snapshotId: resourceIdSchema,
});

export const octoPatchParamsSchema = z.object({
  patchId: z.string().uuid(),
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
    assistantMode: z.enum(['live', 'offline']),
    projects: z.array(z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      snapshotCount: z.number().nonnegative(),
      failedSnapshotCount: z.number().nonnegative(),
      inProgressSnapshotCount: z.number().nonnegative(),
      latestSnapshotAt: z.string().nullable(),
      snapshots: z.array(z.object({ id: z.string(), createdAt: z.string() })),
    })),
    suggestions: z.array(z.string()),
  }),
  intelligence: z.object({ kind: z.enum(['WORKSPACE_STATS', 'PROJECT_SNAPSHOTS', 'SNAPSHOT_COMPARISON']) })
    .passthrough()
    .optional(),
  patchProposal: z.object({
    patchId: z.string().uuid(),
    filePath: z.string(),
    summary: z.string(),
    diff: z.string(),
    additions: z.number().nonnegative(),
    deletions: z.number().nonnegative(),
  }).optional(),
});

export type OctoResponsePayload = z.infer<typeof octoResponseSchema>;
