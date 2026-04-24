import { ForbiddenException, Injectable, NotFoundException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SendMessageInput, StartConversationInput } from '@trainova/shared';
import { ChatGateway } from './chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';

export interface ConversationSummary {
  id: string;
  requestId: string | null;
  updatedAt: Date;
  createdAt: Date;
  unread: number;
  lastMessage: {
    id: string;
    body: string;
    type: string;
    createdAt: Date;
    senderId: string;
    senderName: string | null;
  } | null;
  otherParticipant: {
    userId: string;
    name: string | null;
    role: string;
  } | null;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, role: true } } },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { id: true, name: true } } },
        },
      },
    });

    return Promise.all(
      conversations.map(async (c) => {
        const me = c.participants.find((p) => p.userId === userId);
        const other = c.participants.find((p) => p.userId !== userId);
        const lastReadAt = me?.lastReadAt ?? null;
        const unread = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        const lastMessage = c.messages[0] ?? null;
        return {
          id: c.id,
          requestId: c.requestId,
          updatedAt: c.updatedAt,
          createdAt: c.createdAt,
          unread,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                body: lastMessage.body,
                type: lastMessage.type,
                createdAt: lastMessage.createdAt,
                senderId: lastMessage.senderId,
                senderName: lastMessage.sender?.name ?? null,
              }
            : null,
          otherParticipant: other
            ? {
                userId: other.user.id,
                name: other.user.name,
                role: other.user.role,
              }
            : null,
        };
      }),
    );
  }

  async totalUnread(userId: string): Promise<number> {
    const parts = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });
    if (parts.length === 0) return 0;
    let total = 0;
    for (const p of parts) {
      total += await this.prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      });
    }
    return total;
  }

  async startConversation(userId: string, input: StartConversationInput) {
    if (input.otherUserId === userId) throw new ForbiddenException('Cannot chat with yourself');
    const other = await this.prisma.user.findUnique({ where: { id: input.otherUserId } });
    if (!other) throw new NotFoundException('User not found');

    const existing = await this.prisma.conversation.findFirst({
      where: {
        requestId: input.requestId ?? null,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: input.otherUserId } } },
        ],
      },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        requestId: input.requestId ?? null,
        participants: {
          create: [{ userId }, { userId: input.otherUserId }],
        },
      },
      include: { participants: true },
    });
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, role: true } } },
        },
        request: { select: { id: true, title: true, slug: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const isParticipant = conversation.participants.some((p) => p.userId === userId);
    if (!isParticipant) throw new ForbiddenException('Not a participant');
    return conversation;
  }

  async listMessages(userId: string, conversationId: string) {
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!part) throw new ForbiddenException('Not a participant');
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { sender: { select: { id: true, name: true, role: true } } },
    });
  }

  async sendMessage(userId: string, input: SendMessageInput) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: input.conversationId },
      select: { userId: true },
    });
    if (!participants.some((p) => p.userId === userId)) {
      throw new ForbiddenException('Not a participant');
    }
    const message = await this.prisma.message.create({
      data: { conversationId: input.conversationId, senderId: userId, body: input.body },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });
    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });
    // Mark sender as having read through their own message.
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId: input.conversationId, userId },
      },
      data: { lastReadAt: message.createdAt },
    });

    this.gateway.emitNewMessage(
      input.conversationId,
      message,
      participants.map((p) => p.userId),
    );

    // In-app notification for every recipient who is not the sender. We emit
    // one Notification row per recipient so the bell/unread-count aggregates
    // correctly even if the socket push is missed (e.g. offline user).
    const senderName = message.sender?.name ?? 'Someone';
    const preview = message.body.slice(0, 140);
    for (const p of participants) {
      if (p.userId === userId) continue;
      await this.notifications.emit({
        userId: p.userId,
        type: 'chat.message',
        payload: {
          title: `New message from ${senderName}`,
          body: preview,
          href: `/chat/${input.conversationId}`,
          meta: {
            conversationId: input.conversationId,
            messageId: message.id,
            senderId: userId,
          },
        },
      });
    }

    return message;
  }

  async markRead(userId: string, conversationId: string) {
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!part) throw new ForbiddenException('Not a participant');
    const now = new Date();
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now },
    });
    this.gateway.emitReadUpdate(conversationId, userId, now.toISOString());
    return { ok: true, lastReadAt: now };
  }
}
