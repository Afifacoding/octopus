import { describe, expect, it } from 'vitest';

import {
  createOctoConversationSchema,
  getOctoConversationQuerySchema,
  listOctoConversationsSchema,
  renameOctoConversationSchema,
  sendOctoConversationMessageSchema,
} from './octo.conversations.schemas.js';

describe('OCTOBOT conversation schemas', () => {
  it('requires a project only for project conversations', () => {
    expect(createOctoConversationSchema.safeParse({ conversationType: 'GENERAL' }).success).toBe(true);
    expect(createOctoConversationSchema.safeParse({ conversationType: 'GENERAL', projectId: 'proj-1' }).success).toBe(false);
    expect(createOctoConversationSchema.safeParse({ conversationType: 'PROJECT' }).success).toBe(false);
    expect(createOctoConversationSchema.safeParse({ conversationType: 'PROJECT', projectId: 'proj-1' }).success).toBe(true);
  });

  it('bounds pagination and conversation message retrieval', () => {
    expect(listOctoConversationsSchema.parse({}).pageSize).toBe(20);
    expect(listOctoConversationsSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listOctoConversationsSchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(getOctoConversationQuerySchema.safeParse({ messageLimit: 100 }).success).toBe(true);
    expect(getOctoConversationQuerySchema.safeParse({ messageLimit: 101 }).success).toBe(false);
  });

  it('validates title and message lengths and accepted image formats', () => {
    expect(renameOctoConversationSchema.safeParse({ title: '  Debug session  ' }).data).toEqual({ title: 'Debug session' });
    expect(renameOctoConversationSchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(renameOctoConversationSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(sendOctoConversationMessageSchema.safeParse({ content: 'hello' }).success).toBe(true);
    expect(sendOctoConversationMessageSchema.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false);
    expect(sendOctoConversationMessageSchema.safeParse({ content: 'inspect', images: ['data:image/svg+xml;base64,abc'] }).success).toBe(false);
  });
});
