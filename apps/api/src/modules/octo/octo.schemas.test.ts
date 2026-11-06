import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  octoCompareQuerySchema,
  octoGraphQuerySchema,
  octoGraphSearchQuerySchema,
  octoPatchParamsSchema,
  octoProjectParamsSchema,
  octoRequestSchema,
  octoSnapshotParamsSchema,
} from './octo.schemas.js';

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

  it('validates bounded Graphify search parameters', () => {
    expect(octoGraphSearchQuerySchema.safeParse({
      projectId: projectCuid,
      snapshotId: snapshotCuid,
      query: 'AuthService',
    }).success).toBe(true);
    expect(octoGraphSearchQuerySchema.safeParse({
      projectId: projectCuid,
      snapshotId: snapshotCuid,
      query: '',
    }).success).toBe(false);
    expect(octoGraphSearchQuerySchema.safeParse({
      projectId: projectCuid,
      snapshotId: snapshotCuid,
      query: 'auth',
      pageSize: 51,
    }).success).toBe(false);
    expect(octoGraphSearchQuerySchema.safeParse({
      projectId: projectCuid,
      snapshotId: snapshotCuid,
      query: 'auth',
      nodeType: 'secret',
    }).success).toBe(false);
  });

  it('rejects empty or oversized IDs', () => {
    expect(octoGraphQuerySchema.safeParse({ projectId: '', snapshotId: snapshotCuid }).success).toBe(false);
    expect(octoGraphQuerySchema.safeParse({ projectId: projectCuid, snapshotId: 'x'.repeat(129) }).success).toBe(false);
    expect(octoGraphQuerySchema.safeParse({ projectId: projectCuid }).success).toBe(false);
  });

  it('validates snapshot comparison parameters', () => {
    const otherSnapshot = 'cmxyz987wvu6540000tsrq999';
    expect(octoCompareQuerySchema.safeParse({ baseSnapshotId: snapshotCuid, targetSnapshotId: otherSnapshot }).success).toBe(true);
    expect(octoCompareQuerySchema.safeParse({ baseSnapshotId: snapshotCuid, targetSnapshotId: snapshotCuid }).success).toBe(false);
    expect(octoCompareQuerySchema.safeParse({ baseSnapshotId: snapshotCuid }).success).toBe(false);
    expect(octoProjectParamsSchema.safeParse({ projectId: '' }).success).toBe(false);
    expect(octoSnapshotParamsSchema.safeParse({ projectId: projectCuid, snapshotId: snapshotCuid }).success).toBe(true);

    const ask = { question: 'Compare', pageContext: 'SNAPSHOT', compare: { baseSnapshotId: snapshotCuid, targetSnapshotId: otherSnapshot } };
    expect(octoRequestSchema.safeParse(ask).success).toBe(false);
    expect(octoRequestSchema.safeParse({ ...ask, projectId: projectCuid }).success).toBe(true);
    expect(
      octoRequestSchema.safeParse({ ...ask, projectId: projectCuid, compare: { baseSnapshotId: snapshotCuid, targetSnapshotId: snapshotCuid } }).success,
    ).toBe(false);
  });

  it('keeps patch IDs restricted to server-generated UUIDs', () => {
    expect(octoPatchParamsSchema.safeParse({ patchId: randomUUID() }).success).toBe(true);
    expect(octoPatchParamsSchema.safeParse({ patchId: projectCuid }).success).toBe(false);
  });
});
