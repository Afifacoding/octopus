import { z } from 'zod';

export const projectIdParamsSchema = z.object({
  projectId: z.string().min(1),
});

export const projectSecretIdParamsSchema = z.object({
  projectId: z.string().min(1),
  secretId: z.string().min(1),
});

export const snapshotDetectionParamsSchema = z.object({
  projectId: z.string().min(1),
  snapshotId: z.string().min(1),
});

export const detectionIdParamsSchema = z.object({
  projectId: z.string().min(1),
  snapshotId: z.string().min(1),
  detectionId: z.string().min(1),
});

export const createSecretSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    category: z.enum([
      'API_KEY',
      'ACCESS_TOKEN',
      'SECRET_KEY',
      'PRIVATE_KEY',
      'DATABASE_URL',
      'JWT',
      'OAUTH_CLIENT_SECRET',
      'CLOUD_CREDENTIAL',
      'WEBHOOK_SECRET',
      'PASSWORD',
      'GENERIC_SECRET',
    ]),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    value: z.string().min(1).max(20000).optional(),
    sourceSnapshotId: z.string().min(1).optional(),
    sourceDetectionId: z.string().min(1).optional(),
    sourceFilePath: z.string().min(1).max(2048).optional(),
    sourceLineNumber: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (!value.value && !(value.sourceSnapshotId && value.sourceDetectionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either a secret value or sourceSnapshotId and sourceDetectionId',
        path: ['value'],
      });
    }
  });

export const updateSecretSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  category: z
    .enum([
      'API_KEY',
      'ACCESS_TOKEN',
      'SECRET_KEY',
      'PRIVATE_KEY',
      'DATABASE_URL',
      'JWT',
      'OAUTH_CLIENT_SECRET',
      'CLOUD_CREDENTIAL',
      'WEBHOOK_SECRET',
      'PASSWORD',
      'GENERIC_SECRET',
    ])
    .optional(),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const markDetectionSchema = z.object({
  status: z.enum(['IGNORED', 'OPEN']),
});

export const vaultUnlockSchema = z.object({
  password: z.string().min(1).max(256),
});
