import type { OctoConversationMessageRole, OctoConversationType, Prisma } from '@prisma/client';

import { prisma } from '../../db/client.js';

const conversationListSelect = {
  id: true,
  title: true,
  conversationType: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true } },
} satisfies Prisma.OctoConversationSelect;

export class OctoConversationsRepository {
  async createConversation(input: {
    userId: string;
    title?: string;
    conversationType: OctoConversationType;
    projectId?: string;
  }) {
    return prisma.octoConversation.create({
      data: {
        userId: input.userId,
        title: input.title ?? 'New chat',
        conversationType: input.conversationType,
        ...(input.projectId ? { projectId: input.projectId } : {}),
      },
      select: conversationListSelect,
    });
  }

  async listConversations(input: {
    userId: string;
    page: number;
    pageSize: number;
    conversationType?: OctoConversationType;
  }) {
    const where: Prisma.OctoConversationWhereInput = {
      userId: input.userId,
      ...(input.conversationType ? { conversationType: input.conversationType } : {}),
    };
    const [total, conversations] = await prisma.$transaction([
      prisma.octoConversation.count({ where }),
      prisma.octoConversation.findMany({
        where,
        select: conversationListSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);

    return {
      conversations,
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasMore: input.page * input.pageSize < total,
    };
  }

  async findConversation(userId: string, conversationId: string) {
    return prisma.octoConversation.findFirst({
      where: { id: conversationId, userId },
      select: conversationListSelect,
    });
  }

  async findMessageCursor(userId: string, conversationId: string, messageId: string) {
    return prisma.octoConversationMessage.findFirst({
      where: { id: messageId, conversationId, conversation: { userId } },
      select: { id: true, createdAt: true },
    });
  }

  async listMessages(
    userId: string,
    conversationId: string,
    limit: number,
    before?: { id: string; createdAt: Date },
  ) {
    const rows = await prisma.octoConversationMessage.findMany({
      where: {
        conversationId,
        conversation: { userId },
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse();
    return { messages, hasMore };
  }

  async listRecentMessages(userId: string, conversationId: string, limit: number) {
    const rows = await prisma.octoConversationMessage.findMany({
      where: { conversationId, conversation: { userId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return rows.reverse();
  }

  async renameConversation(userId: string, conversationId: string, title: string) {
    const result = await prisma.octoConversation.updateMany({
      where: { id: conversationId, userId },
      data: { title },
    });
    if (result.count === 0) return null;
    return this.findConversation(userId, conversationId);
  }

  async deleteConversation(userId: string, conversationId: string) {
    const result = await prisma.octoConversation.deleteMany({
      where: { id: conversationId, userId },
    });
    return result.count > 0;
  }

  async createUserMessage(input: {
    userId: string;
    conversationId: string;
    content: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (transaction) => {
      const conversation = await transaction.octoConversation.findFirst({
        where: { id: input.conversationId, userId: input.userId },
        select: { id: true, title: true },
      });
      if (!conversation) return null;

      const message = await transaction.octoConversationMessage.create({
        data: {
          conversationId: input.conversationId,
          role: 'USER',
          content: input.content,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        select: { id: true, role: true, content: true, metadata: true, createdAt: true },
      });
      await transaction.octoConversation.update({
        where: { id: input.conversationId },
        data: {
          updatedAt: new Date(),
          ...(conversation.title === 'New chat'
            ? { title: input.content.slice(0, 60).trim() || 'New chat' }
            : {}),
        },
      });
      return message;
    });
  }

  async createAssistantMessage(input: {
    userId: string;
    conversationId: string;
    content: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (transaction) => {
      const conversation = await transaction.octoConversation.findFirst({
        where: { id: input.conversationId, userId: input.userId },
        select: { id: true },
      });
      if (!conversation) return null;

      const message = await transaction.octoConversationMessage.create({
        data: {
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: input.content,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        select: { id: true, role: true, content: true, metadata: true, createdAt: true },
      });
      await transaction.octoConversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }
}

export type OctoConversationMessageRecord = {
  id: string;
  role: OctoConversationMessageRole;
  content: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};
