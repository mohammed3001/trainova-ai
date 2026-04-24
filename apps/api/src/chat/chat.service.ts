import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SendMessageInput, StartConversationInput } from '@trainova/shared';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(userId: string) {
    // Explicit nested `select` on `messages` so admin redaction metadata
    // (`redactedById`, `redactReason`) is never surfaced to participants
    // via the last-message preview. `redactedAt` stays — the client needs
    // it to render "[redacted]" instead of the body.
    return this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        requestId: true,
        lockedAt: true,
        createdAt: true,
        updatedAt: true,
        participants: {
          select: {
            userId: true,
            conversationId: true,
            lastReadAt: true,
            user: { select: { id: true, name: true, role: true } },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            conversationId: true,
            senderId: true,
            body: true,
            type: true,
            redactedAt: true,
            createdAt: true,
          },
        },
      },
    });
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

  async listMessages(userId: string, conversationId: string) {
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!part) throw new ForbiddenException('Not a participant');
    // Explicit select: never leak admin redaction metadata (`redactedById`,
    // `redactReason`) to participants. `redactedAt` is safe and tells the
    // client to render "[redacted]" instead of the body.
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        body: true,
        type: true,
        redactedAt: true,
        createdAt: true,
        sender: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async sendMessage(userId: string, input: SendMessageInput) {
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: input.conversationId, userId } },
    });
    if (!part) throw new ForbiddenException('Not a participant');
    // Admin-locked conversations are frozen — participants may still read
    // history but cannot add new messages. Keeping the ForbiddenException
    // with a stable error code lets the chat UI render the lock notice.
    const conv = await this.prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { lockedAt: true },
    });
    if (conv?.lockedAt) {
      throw new ForbiddenException('Conversation is locked');
    }
    const message = await this.prisma.message.create({
      data: { conversationId: input.conversationId, senderId: userId, body: input.body },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });
    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });
    return message;
  }
}
