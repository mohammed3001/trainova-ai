import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

const PushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
});

const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    // Clamp the client-supplied limit into a sane range so a malformed
    // ?limit=abc (NaN) or ?limit=-5 (reverses Prisma's cursor direction)
    // can't crash the endpoint or return bogus rows.
    const parsed = limit !== undefined ? Number(limit) : 50;
    const safeLimit = Number.isFinite(parsed)
      ? Math.max(1, Math.min(100, Math.trunc(parsed)))
      : 50;
    return this.notifications.list(user.id, safeLimit, cursor);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    const count = await this.notifications.unreadCount(user.id);
    return { count };
  }

  @Post('read-all')
  markAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  markOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  // -----------------------------------------------------------------
  // Web Push (T7.F)
  // -----------------------------------------------------------------

  @Get('push/public-key')
  publicKey() {
    // Public-key bootstrap is allowed even when push isn't configured —
    // the client treats `null` as "web push disabled" and skips the
    // service worker registration entirely.
    return {
      enabled: this.push.isEnabled(),
      publicKey: this.push.getPublicKey(),
    };
  }

  @Post('push/subscribe')
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Headers('user-agent') userAgent?: string,
  ) {
    const parsed = PushSubscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    if (!this.push.isEnabled()) {
      // Treat as a no-op rather than 503 so the client doesn't loop on
      // retries when the platform is dev/preview without VAPID keys.
      return { ok: true, configured: false };
    }
    const sub = await this.push.subscribe({
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: userAgent?.slice(0, 512) ?? null,
    });
    return { ok: true, configured: true, id: sub.id };
  }

  @Delete('push/subscribe')
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = PushUnsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.push.unsubscribe(user.id, parsed.data.endpoint);
  }
}
