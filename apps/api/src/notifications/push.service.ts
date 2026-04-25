import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationPayload, NotificationType } from './notifications.service';

/**
 * Web Push (RFC 8030 / RFC 8291) delivery for browser PushSubscriptions.
 *
 * Configuration is opt-in: if VAPID env vars are not set the service no-ops
 * silently — local/dev runs without HTTPS + a real push service should not
 * blow up on every emit. In production the env vars are required.
 *
 * The service is intentionally side-effect-only: callers fire-and-forget
 * via {@link sendToUser}; failures are logged but never propagated to the
 * domain transaction that triggered the original Notification.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private configured = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject =
      process.env.VAPID_SUBJECT?.trim() || 'mailto:support@trainova.ai';
    if (!publicKey || !privateKey) {
      this.logger.log(
        'VAPID keys not configured — web push disabled (set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)',
      );
      return;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
      this.logger.log('Web push configured (VAPID OK)');
    } catch (err) {
      this.logger.warn(
        `VAPID setup failed (${(err as Error).message}) — web push disabled`,
      );
    }
  }

  isEnabled(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return this.configured ? (process.env.VAPID_PUBLIC_KEY?.trim() ?? null) : null;
  }

  /**
   * Fan-out a notification to every registered PushSubscription for the
   * user. 410/404 from the push service means the subscription is dead
   * (unsubscribed in the browser, GC'd by Mozilla autopush, etc.) — we
   * delete those rows so we don't keep retrying.
   */
  async sendToUser(
    userId: string,
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<void> {
    if (!this.configured) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      type,
      title: payload.title,
      body: payload.body ?? '',
      href: payload.href ?? '/',
      meta: payload.meta ?? {},
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            body,
            { TTL: 60 * 60 * 24 },
          );
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => undefined);
            return;
          }
          this.logger.warn(
            `web push send failed for sub ${s.id} (status=${code}): ${(err as Error).message}`,
          );
        }
      }),
    );
  }

  async subscribe(args: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  }) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: args.endpoint },
      create: {
        userId: args.userId,
        endpoint: args.endpoint,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent ?? null,
      },
      // Re-bind the endpoint to the current user (e.g. shared device,
      // logged out + back in as someone else) and refresh the keys in
      // case the browser rotated them.
      update: {
        userId: args.userId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent ?? null,
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint },
      select: { userId: true },
    });
    if (!existing) return { ok: true };
    if (existing.userId !== userId) return { ok: true }; // silent no-op, don't leak ownership
    await this.prisma.pushSubscription.delete({ where: { endpoint } });
    return { ok: true };
  }
}
