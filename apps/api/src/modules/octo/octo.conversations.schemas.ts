import { z } from 'zod';

import { octoPageContextSchema } from './octo.schemas.js';

const resourceIdSchema = z.string().min(1).max(128);
const conversationTitleSchema = z.string().trim().min(1).max(120);

export const createOctoConversationSchema = z.object({
  title: conversationTitleSchema.optional(),
  conversationType: z.enum(['GENERAL', 'PROJECT']),
  projectId: resourceIdSchema.optional(),
}).superRefine((value, context) => {
  if (value.conversationType === 'PROJECT' && !value.projectId) {
    context.addIssue({ code: 'custom', path: ['projectId'], message: 'Project conversations require a project' });
  }
  if (value.conversationType === 'GENERAL' && value.projectId) {
    context.addIssue({ code: 'custom', path: ['projectId'], message: 'General conversations cannot be project-scoped' });
  }
});

export const listOctoConversationsSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  conversationType: z.enum(['GENERAL', 'PROJECT']).optional(),
});

export const octoConversationParamsSchema = z.object({
  conversationId: resourceIdSchema,
});

export const getOctoConversationQuerySchema = z.object({
  messageLimit: z.coerce.number().int().min(1).max(100).default(100),
  beforeMessageId: resourceIdSchema.optional(),
});

export const renameOctoConversationSchema = z.object({
  title: conversationTitleSchema,
});

export const sendOctoConversationMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  pageContext: octoPageContextSchema.default('DASHBOARD'),
  mode: z.enum(['learn', 'debug', 'dsa', 'code-review', 'interview', 'project-assistant']).optional(),
  snapshotId: resourceIdSchema.optional(),
  compare: z.object({
    baseSnapshotId: resourceIdSchema,
    targetSnapshotId: resourceIdSchema,
  }).optional(),
  images: z.array(
    z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i).max(1_500_000),
  ).max(1).optional(),
}).superRefine((value, context) => {
  if (!value.compare) return;
  if (value.compare.baseSnapshotId === value.compare.targetSnapshotId) {
    context.addIssue({ code: 'custom', path: ['compare'], message: 'Choose two different snapshots to compare' });
  }
});

export type CreateOctoConversationInput = z.infer<typeof createOctoConversationSchema>;
export type ListOctoConversationsInput = z.infer<typeof listOctoConversationsSchema>;
export type SendOctoConversationMessageInput = z.infer<typeof sendOctoConversationMessageSchema>;
