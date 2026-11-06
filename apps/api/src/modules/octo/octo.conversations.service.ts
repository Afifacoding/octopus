import type { Prisma } from '@prisma/client';

import { HttpError } from '../../core/errors/http-error.js';
import { ProjectsRepository } from '../projects/projects.repository.js';
import { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import { isBlockedSensitiveRequest, sanitizeTextForOcto } from './octo.security.js';
import type { OctoService } from './octo.service.js';
import type {
  CreateOctoConversationInput,
  ListOctoConversationsInput,
  SendOctoConversationMessageInput,
} from './octo.conversations.schemas.js';
import { OctoConversationsRepository } from './octo.conversations.repository.js';

const AI_CONTEXT_MESSAGE_LIMIT = 10;
const AI_CONTEXT_CHARACTER_LIMIT = 24_000;
const AI_CONTEXT_MESSAGE_CHARACTER_LIMIT = 4_000;
const MESSAGE_PAGE_LIMIT = 100;

function safeMessageContent(content: string) {
  return sanitizeTextForOcto(content).trim();
}

function readMessageMetadata(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  return metadata;
}

export class OctoConversationsService {
  constructor(
    private readonly conversations: OctoConversationsRepository,
    private readonly projects: ProjectsRepository,
    private readonly snapshots: SnapshotsRepository,
    private readonly octo: Pick<OctoService, 'ask'>,
  ) {}

  async createConversation(userId: string, input: CreateOctoConversationInput) {
    if (input.conversationType === 'PROJECT' && input.projectId) {
      const project = await this.projects.findProjectByIdForOwner(userId, input.projectId);
      if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    return this.conversations.createConversation({
      userId,
      conversationType: input.conversationType,
      ...(input.title ? { title: safeMessageContent(input.title) } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });
  }

  listConversations(userId: string, input: ListOctoConversationsInput) {
    return this.conversations.listConversations({
      userId,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.conversationType ? { conversationType: input.conversationType } : {}),
    });
  }

  async getConversation(userId: string, conversationId: string, messageLimit: number, beforeMessageId?: string) {
    const conversation = await this.conversations.findConversation(userId, conversationId);
    if (!conversation) throw new HttpError(404, 'OCTO_CONVERSATION_NOT_FOUND', 'Conversation not found');

    const boundedLimit = Math.min(messageLimit, MESSAGE_PAGE_LIMIT);
    const cursor = beforeMessageId
      ? await this.conversations.findMessageCursor(userId, conversationId, beforeMessageId)
      : undefined;
    if (beforeMessageId && !cursor) {
      throw new HttpError(400, 'INVALID_MESSAGE_CURSOR', 'Message cursor is invalid');
    }
    const page = await this.conversations.listMessages(userId, conversationId, boundedLimit, cursor ?? undefined);
    return {
      ...conversation,
      ...page,
      messages: page.messages.map((message) => this.toMessage(message)),
      nextCursor: page.hasMore ? page.messages[0]?.id ?? null : null,
    };
  }

  async renameConversation(userId: string, conversationId: string, title: string) {
    const safeTitle = safeMessageContent(title);
    if (!safeTitle) throw new HttpError(400, 'INVALID_CONVERSATION_TITLE', 'Conversation title cannot be empty');
    const conversation = await this.conversations.renameConversation(userId, conversationId, safeTitle);
    if (!conversation) throw new HttpError(404, 'OCTO_CONVERSATION_NOT_FOUND', 'Conversation not found');
    return conversation;
  }

  async deleteConversation(userId: string, conversationId: string) {
    const deleted = await this.conversations.deleteConversation(userId, conversationId);
    if (!deleted) throw new HttpError(404, 'OCTO_CONVERSATION_NOT_FOUND', 'Conversation not found');
    return { id: conversationId, deleted: true };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: SendOctoConversationMessageInput,
  ) {
    const conversation = await this.conversations.findConversation(userId, conversationId);
    if (!conversation) throw new HttpError(404, 'OCTO_CONVERSATION_NOT_FOUND', 'Conversation not found');
    if (input.compare && !conversation.projectId) {
      throw new HttpError(400, 'COMPARE_REQUIRES_PROJECT', 'Snapshot comparison requires a project conversation');
    }
    if (input.snapshotId) {
      if (!conversation.projectId) {
        throw new HttpError(400, 'SNAPSHOT_REQUIRES_PROJECT', 'A snapshot can only be used in a project conversation');
      }
      const snapshot = await this.snapshots.findSnapshotByIdForOwner(userId, conversation.projectId, input.snapshotId);
      if (!snapshot) throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    const content = safeMessageContent(input.content);
    if (!content) throw new HttpError(400, 'INVALID_MESSAGE', 'Message cannot be empty');
    const prompt = content || (input.images?.length ? 'Please inspect this screenshot and explain the issue.' : '');
    const previousMessages = await this.conversations.listRecentMessages(
      userId,
      conversationId,
      AI_CONTEXT_MESSAGE_LIMIT + 1,
    );
    const userMessage = await this.conversations.createUserMessage({
      userId,
      conversationId,
      content: isBlockedSensitiveRequest(prompt) ? '[Sensitive request omitted]' : prompt,
      ...(input.images?.length ? { metadata: { hasImage: true } } : {}),
    });
    if (!userMessage) throw new HttpError(404, 'OCTO_CONVERSATION_NOT_FOUND', 'Conversation not found');

    const history = this.buildAiHistory(previousMessages);
    const response = await this.octo.ask({
      question: prompt,
      pageContext: input.pageContext,
      userId,
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
      ...(input.images?.length ? { images: input.images } : {}),
      ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
      ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
      ...(input.compare ? { compare: input.compare } : {}),
      history,
      throwOnAiFailure: true,
    });

    const assistantContent = safeMessageContent(response.reply);
    const assistantMessage = await this.conversations.createAssistantMessage({
      userId,
      conversationId,
      content: assistantContent,
      ...((response.intelligence || response.modelSelection)
        ? { metadata: {
            ...(response.intelligence ? { intelligence: response.intelligence } : {}),
            ...(response.modelSelection ? { modelSelection: response.modelSelection } : {}),
          } }
        : {}),
    });
    if (!assistantMessage) throw new HttpError(404, 'OCTO_CONVERSATION_NOT_FOUND', 'Conversation not found');

    return {
      userMessage: this.toMessage(userMessage),
      assistantMessage: this.toMessage(assistantMessage),
      ...(response.patchProposal ? { patchProposal: response.patchProposal } : {}),
      conversation: await this.conversations.findConversation(userId, conversationId),
    };
  }

  private buildAiHistory(
    messages: Array<{ id: string; role: 'USER' | 'ASSISTANT'; content: string }>,
  ) {
    const history = messages
      .filter((message) => message.role !== 'USER' || !isBlockedSensitiveRequest(message.content))
      .slice(-AI_CONTEXT_MESSAGE_LIMIT)
      .map((message) => ({
        role: message.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: safeMessageContent(message.content).slice(-AI_CONTEXT_MESSAGE_CHARACTER_LIMIT),
      }));

    let remaining = AI_CONTEXT_CHARACTER_LIMIT;
    const boundedFromNewest = [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (!item || remaining <= 0) break;
      const content = item.content.slice(-remaining);
      boundedFromNewest.push({ ...item, content });
      remaining -= content.length;
    }
    return boundedFromNewest.reverse();
  }

  private toMessage(message: {
    id: string;
    role: 'USER' | 'ASSISTANT';
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      role: message.role,
      content: safeMessageContent(message.content),
      metadata: readMessageMetadata(message.metadata),
      createdAt: message.createdAt,
    };
  }
}
