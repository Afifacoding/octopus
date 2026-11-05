import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { octoGraphQuerySchema, octoPatchParamsSchema, octoRequestSchema } from './octo.schemas.js';

const projectCuid = 'cmabc123def4560000ghij789';
const snapshotCuid = 'cmxyz987wvu6540000tsrq321';

describe('octo schemas', () => {
  it('accepts Prisma cuid project and snapshot IDs on ask requests', () => {
    const result = octoRequestSchema.safeParse({
      question: 'Explain the entry point',
      pageContext: 'SNAPSHOT',
      mode: 'project-assistant',
      projectId: projectCuid,
      snapshotId: snapshotCuid,
    });

    expect(result.success).toBe(true);
  });

  it('accepts Prisma cuid IDs on graph queries', () => {
    expect(octoGraphQuerySchema.safeParse({ projectId: projectCuid, snapshotId: snapshotCuid }).success).toBe(true);
  });

  it('rejects empty or oversized IDs', () => {
    expect(octoGraphQuerySchema.safeParse({ projectId: '', snapshotId: snapshotCuid }).success).toBe(false);
    expect(octoGraphQuerySchema.safeParse({ projectId: projectCuid, snapshotId: 'x'.repeat(129) }).success).toBe(false);
    expect(octoGraphQuerySchema.safeParse({ projectId: projectCuid }).success).toBe(false);
  });

  it('keeps patch IDs restricted to server-generated UUIDs', () => {
    expect(octoPatchParamsSchema.safeParse({ patchId: randomUUID() }).success).toBe(true);
    expect(octoPatchParamsSchema.safeParse({ patchId: projectCuid }).success).toBe(false);
  });
});
