import { ForbiddenException, Injectable, forwardRef, Inject } from '@nestjs/common';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { EmailService } from '../email/email.service';

export type NotificationType =
  // Applications
  | 'application.received'
  | 'application.shortlisted'
  | 'application.accepted'
  | 'application.rejected'
  // Evaluations
  | 'test.assigned'
  | 'test.submitted'
  | 'test.graded'
  // Chat
  | 'chat.message'
  // System
  | 'system.announcement';

export interface NotificationPayload {
  title: string;
  body?: string;
  href?: string;
  meta?: Record<string, unknown>;
}

interface EmitArgs {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  email?: { subject: string; html: string } | null;
}

/**
 * Central hub for creating, querying and pushing notifications. Every domain
 * service that has a meaningful event for a user should call `emit()` here
 * rather than writing to the `Notification` table directly.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
    private readonly email: EmailService,
  ) {}

  async emit(args: EmitArgs) {
    const row = await this.prisma.notification.create({
      data: {
        userId: args.userId,
        type: args.type,
        payload: args.payload as unknown as Prisma.InputJsonValue,
      },
    });
    this.gateway.pushToUser(args.userId, {
      id: row.id,
      type: row.type,
      payload: row.payload as unknown as NotificationPayload,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    });

    if (args.email) {
      const user = await this.prisma.user.findUnique({
        where: { id: args.userId },
        select: { email: true, name: true },
      });
      if (user?.email) {
        await this.email
          .sendRaw(user.email, args.email.subject, args.email.html)
          .catch(() => undefined);
      }
    }

    return row;
  }

  async list(userId: string, limit = 50, cursor?: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > Math.min(limit, 100);
    const items = hasMore ? rows.slice(0, -1) : rows;
    const unreadCount = await this.unreadCount(userId);
    const last = items[items.length - 1];
    return {
      items: items.map((r) => ({
        id: r.id,
        type: r.type,
        payload: r.payload as unknown as NotificationPayload,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last ? last.id : null,
      unreadCount,
    };
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) return { ok: false };
    if (row.userId !== userId) throw new ForbiddenException('Not yours');
    if (row.readAt) return { ok: true };
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });
    return { ok: true, updated: res.count };
  }
}
