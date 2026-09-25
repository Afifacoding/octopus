import { z } from 'zod';

export const snapshotStatusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export const snapshotCaptureSourceSchema = z.enum(['EXTENSION', 'WEB', 'API']);

export const projectSnapshotParamsSchema = z.object({
  projectId: z.string().min(1),
});

export const snapshotIdParamsSchema = z.object({
  projectId: z.string().min(1),
  snapshotId: z.string().min(1),
});

export const snapshotFileContentQuerySchema = z.object({
  path: z.string().trim().min(1).max(512),
});

export const snapshotArchiveEntrySchema = z.object({
  path: z.string().min(1).max(512),
  type: z.enum(['FILE', 'DIRECTORY']),
});

export const createSnapshotSchema = z.object({
  captureSource: snapshotCaptureSourceSchema,
  clientName: z.string().trim().min(1).max(120).optional(),
  clientVersion: z.string().trim().min(1).max(60).optional(),
  fileCount: z.number().int().min(0).max(500000).optional(),
  directoryCount: z.number().int().min(0).max(200000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  archive: z.object({
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().toLowerCase().min(1).max(120),
    base64Data: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  }),
  entries: z.array(snapshotArchiveEntrySchema).max(500000).optional(),
});

export type CreateSnapshotPayload = z.infer<typeof createSnapshotSchema>;
