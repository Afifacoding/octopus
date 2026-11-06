import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../../core/errors/http-error.js';
import type { ProjectsRepository } from '../projects/projects.repository.js';
import type { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import type { OctoRequest, OctoResponse } from './octo.types.js';
import type { OctoService } from './octo.service.js';
import { OctoConversationsService } from './octo.conversations.service.js';
import type { OctoConversationsRepository } from './octo.conversations.repository.js';

const createdAt = new Date('2026-11-06T10:00:00.000Z');

function createHarness() {
  const conversation = {
    id: 'conv-1',
    title: 'New chat',
    conversationType: 'PROJECT' as const,
    projectId: 'proj-1',
    createdAt,
    updatedAt: createdAt,
    project: { id: 'proj-1', name: 'Project One' },
  };
  const messages: Array<{
    id: string;
    role: 'USER' | 'ASSISTANT';
    content: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }> = [];
  let messageNumber = 0;
  const repository = {
    createConversation: vi.fn(async (input: { title?: string; projectId?: string; conversationType: 'GENERAL' | 'PROJECT' }) => ({
      ...conversation,
      ...input,
      title: input.title ?? 'New chat',
      projectId: input.projectId ?? null,
      project: input.projectId ? conversation.project : null,
    })),
    listConversations: vi.fn(async (input: unknown) => ({ conversations: [conversation], page: 1, pageSize: 20, total: 1, hasMore: false, input })),
    findConversation: vi.fn(async (userId: string, id: string) => userId === 'owner-1' && id === 'conv-1' ? conversation : null),
    listMessages: vi.fn(async (_userId: string, _conversationId: string, limit: number) => ({
      messages: messages.slice(-limit),
      hasMore: messages.length > limit,
    })),
    listRecentMessages: vi.fn(async (_userId: string, _conversationId: string) => [...messages]),
    renameConversation: vi.fn(async (userId: string, id: string, title: string) => userId === 'owner-1' && id === 'conv-1'
      ? { ...conversation, title }
      : null),
    deleteConversation: vi.fn(async (userId: string, id: string) => userId === 'owner-1' && id === 'conv-1'),
    createUserMessage: vi.fn(async (input: { content: string; metadata?: Record<string, unknown> }) => {
      const message = {
        id: `message-${++messageNumber}`,
        role: 'USER' as const,
        content: input.content,
        metadata: input.metadata ?? null,
        createdAt: new Date(createdAt.getTime() + messageNumber),
      };
      messages.push(message);
      return message;
    }),
    createAssistantMessage: vi.fn(async (input: { content: string; metadata?: Record<string, unknown> }) => {
      const message = {
        id: `message-${++messageNumber}`,
        role: 'ASSISTANT' as const,
        content: input.content,
        metadata: input.metadata ?? null,
        createdAt: new Date(createdAt.getTime() + messageNumber),
      };
      messages.push(message);
      return message;
    }),
  };
  const projects = { findProjectByIdForOwner: vi.fn(async (userId: string, projectId: string) =>
    userId === 'owner-1' && projectId === 'proj-1' ? { id: projectId } : null) };
  const snapshots = { findSnapshotByIdForOwner: vi.fn(async (userId: string, projectId: string, snapshotId: string) =>
    userId === 'owner-1' && projectId === 'proj-1' && snapshotId === 'snap-1' ? { id: snapshotId } : null) };
  const defaultOctoResponse: OctoResponse = {
      reply: 'Verified response',
      intent: 'UNKNOWN',
      suggestions: [],
      summary: {
        greeting: 'Hello',
        projectCount: 0,
        snapshotCount: 0,
        assistantMode: 'offline',
        projects: [],
        suggestions: [],
      },
      intelligence: {
        kind: 'WORKSPACE_STATS',
        stats: {
          countingRules: [],
          projectCount: 1,
          completedSnapshotCount: 0,
          failedSnapshotCount: 0,
          inProgressSnapshotCount: 0,
          projects: [],
          mostSnapshots: null,
          latestSnapshot: null,
        },
      },
    };
  const octo = {
    ask: vi.fn(async (_request: OctoRequest) => defaultOctoResponse),
  };
  const service = new OctoConversationsService(
    repository as unknown as OctoConversationsRepository,
    projects as unknown as ProjectsRepository,
    snapshots as unknown as SnapshotsRepository,
    octo as unknown as Pick<OctoService, 'ask'>,
  );
  return { service, repository, projects, snapshots, octo, messages, conversation };
}

describe('OctoConversationsService', () => {
  it('creates only owner-validated project conversations and rejects unowned projects', async () => {
    const { service, projects, repository } = createHarness();
    await service.createConversation('owner-1', { conversationType: 'PROJECT', projectId: 'proj-1' });
    expect(projects.findProjectByIdForOwner).toHaveBeenCalledWith('owner-1', 'proj-1');
    expect(repository.createConversation).toHaveBeenCalledWith({
      userId: 'owner-1',
      conversationType: 'PROJECT',
      projectId: 'proj-1',
    });

    await expect(service.createConversation('other-user', { conversationType: 'PROJECT', projectId: 'proj-1' }))
      .rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('scopes list, retrieval, rename and deletion operations to the authenticated user', async () => {
    const { service, repository } = createHarness();
    await service.listConversations('owner-1', { page: 2, pageSize: 10, conversationType: 'PROJECT' });
    expect(repository.listConversations).toHaveBeenCalledWith({
      userId: 'owner-1',
      page: 2,
      pageSize: 10,
      conversationType: 'PROJECT',
    });
    await expect(service.getConversation('other-user', 'conv-1', 100)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.renameConversation('other-user', 'conv-1', 'title')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.deleteConversation('other-user', 'conv-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('renames and deletes conversations for their owner', async () => {
    const { service, repository } = createHarness();
    const renamed = await service.renameConversation('owner-1', 'conv-1', '  New title  ');
    expect(renamed.title).toBe('New title');
    expect(repository.renameConversation).toHaveBeenCalledWith('owner-1', 'conv-1', 'New title');
    await expect(service.deleteConversation('owner-1', 'conv-1')).resolves.toEqual({ id: 'conv-1', deleted: true });
  });

  it('returns bounded conversation messages chronologically', async () => {
    const { service, repository } = createHarness();
    repository.listMessages.mockResolvedValue({
      messages: [
        { id: '1', role: 'USER', content: 'first', metadata: null, createdAt: new Date('2026-01-01') },
        { id: '2', role: 'ASSISTANT', content: 'second', metadata: null, createdAt: new Date('2026-01-02') },
      ],
      hasMore: true,
    });

    const result = await service.getConversation('owner-1', 'conv-1', 100);
    expect(result.messages.map((message) => message.id)).toEqual(['1', '2']);
    expect(result.hasMore).toBe(true);
    expect(repository.listMessages).toHaveBeenCalledWith('owner-1', 'conv-1', 100, undefined);
  });

  it('persists user and assistant messages with intelligence metadata and project context', async () => {
    const { service, repository, octo, messages } = createHarness();
    const result = await service.sendMessage('owner-1', 'conv-1', {
      content: 'How many projects?',
      pageContext: 'DASHBOARD',
      mode: 'project-assistant',
      snapshotId: 'snap-1',
    });

    expect(result.userMessage.role).toBe('USER');
    expect(result.assistantMessage.role).toBe('ASSISTANT');
    expect(result.assistantMessage.metadata).toMatchObject({ intelligence: { kind: 'WORKSPACE_STATS' } });
    expect(octo.ask).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1',
      projectId: 'proj-1',
      snapshotId: 'snap-1',
      question: 'How many projects?',
      throwOnAiFailure: true,
    }));
    expect(repository.createUserMessage).toHaveBeenCalledTimes(1);
    expect(repository.createAssistantMessage).toHaveBeenCalledTimes(1);
    expect(messages.map((message) => message.role)).toEqual(['USER', 'ASSISTANT']);
    expect(messages[0]?.createdAt.getTime()).toBeLessThan(messages[1]?.createdAt.getTime() ?? 0);
  });

  it('passes the selected model to OCTOBOT and persists it with the assistant message', async () => {
    const { service, repository, octo } = createHarness();
    const modelSelection = { provider: 'openai' as const, model: 'gpt-4o-mini' };
    octo.ask.mockResolvedValue({
      reply: 'A generated explanation.',
      intent: 'UNKNOWN',
      suggestions: [],
      summary: {
        greeting: 'Hello',
        projectCount: 0,
        snapshotCount: 0,
        assistantMode: 'offline',
        projects: [],
        suggestions: [],
      },
      modelSelection,
    });

    const result = await service.sendMessage('owner-1', 'conv-1', {
      content: 'Explain this function',
      pageContext: 'DASHBOARD',
      modelSelection,
    });

    expect(octo.ask).toHaveBeenCalledWith(expect.objectContaining({ modelSelection }));
    expect(result.assistantMessage.metadata).toMatchObject({ modelSelection });
    expect(repository.createAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ modelSelection }),
    }));
  });

  it('does not send snapshots outside the conversation project or to general conversations', async () => {
    const { service, snapshots, octo } = createHarness();
    await expect(service.sendMessage('owner-1', 'conv-1', {
      content: 'Inspect this',
      pageContext: 'DASHBOARD',
      snapshotId: 'other-snapshot',
    })).rejects.toMatchObject({ code: 'SNAPSHOT_NOT_FOUND' });
    expect(snapshots.findSnapshotByIdForOwner).toHaveBeenCalledWith('owner-1', 'proj-1', 'other-snapshot');
    expect(octo.ask).not.toHaveBeenCalled();
  });

  it('redacts blocked credential requests from persisted history', async () => {
    const { service, repository, octo } = createHarness();
    await service.sendMessage('owner-1', 'conv-1', {
      content: 'What is my API key?',
      pageContext: 'DASHBOARD',
    });
    expect(repository.createUserMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: '[Sensitive request omitted]',
    }));
    expect(octo.ask).toHaveBeenCalledWith(expect.objectContaining({ question: 'What is my API key?' }));
  });

  it('redacts database credentials before persistence and model context', async () => {
    const { service, repository, octo } = createHarness();
    const credential = 'postgres://octo-user:db-password@db.example/app';
    await service.sendMessage('owner-1', 'conv-1', {
      content: `Review this connection ${credential}`,
      pageContext: 'DASHBOARD',
    });

    expect(repository.createUserMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Review this connection [REDACTED]',
    }));
    expect(octo.ask).toHaveBeenCalledWith(expect.objectContaining({
      question: 'Review this connection [REDACTED]',
    }));
  });

  it('does not persist assistant failures, while retaining the submitted user message', async () => {
    const { service, repository, octo } = createHarness();
    octo.ask.mockRejectedValue(new HttpError(503, 'OCTOBOT_AI_UNAVAILABLE', 'Unavailable'));
    await expect(service.sendMessage('owner-1', 'conv-1', {
      content: 'Explain this function',
      pageContext: 'DASHBOARD',
    })).rejects.toMatchObject({ code: 'OCTOBOT_AI_UNAVAILABLE' });
    expect(repository.createUserMessage).toHaveBeenCalledTimes(1);
    expect(repository.createAssistantMessage).not.toHaveBeenCalled();
  });

  it('bounds AI history and filters blocked sensitive requests', async () => {
    const { service, repository, octo } = createHarness();
    repository.listRecentMessages.mockResolvedValue(
      Array.from({ length: 14 }, (_, index) => ({
        id: `history-${index}`,
        role: index === 11 ? 'USER' as const : index % 2 ? 'ASSISTANT' as const : 'USER' as const,
        content: index === 11 ? 'What is my password?' : `message ${index} ${'x'.repeat(5000)}`,
        metadata: null,
        createdAt: new Date(createdAt.getTime() + index),
      })),
    );

    await service.sendMessage('owner-1', 'conv-1', { content: 'follow up', pageContext: 'DASHBOARD' });
    const request = octo.ask.mock.calls[0]?.[0];
    expect(request?.history?.length).toBeLessThanOrEqual(10);
    expect(request?.history?.length).toBeGreaterThan(0);
    expect(request?.history?.some((message) => message.content.includes('password'))).toBe(false);
    expect(request?.history?.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(24_000);
  });
});
