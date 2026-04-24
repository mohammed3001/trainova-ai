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
    return this.notifications.list(
      user.id,
      limit ? Number(limit) : 50,
      cursor,
    );
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
