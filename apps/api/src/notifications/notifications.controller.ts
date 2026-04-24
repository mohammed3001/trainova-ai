import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
}
