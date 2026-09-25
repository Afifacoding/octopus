import { z } from 'zod';

import { PROJECT_COLORS } from './projects.colors.js';

export const projectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const projectColorSchema = z.enum(PROJECT_COLORS);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120),
  description: z.string().trim().max(2000).optional(),
  color: projectColorSchema.optional(),
});

export const listProjectsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: projectStatusSchema.optional(),
});

export const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    color: z.union([projectColorSchema, z.null()]).optional(),
  })
  .refine((input) => input.name !== undefined || input.description !== undefined || input.color !== undefined, {
    message: 'At least one field is required for update',
  });

export type CreateProjectPayload = z.infer<typeof createProjectSchema>;
export type ListProjectsQueryPayload = z.infer<typeof listProjectsQuerySchema>;
export type UpdateProjectPayload = z.infer<typeof updateProjectSchema>;
