import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  SETTING_GROUPS,
  bulkSettingUpsertInput,
  settingUpsertInput,
  type BulkSettingUpsertInput,
  type SettingGroup,
  type SettingUpsertInput,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsService, SettingsActor } from './settings.service';

function clientIp(req: Request): string | null {
  const addr = (req.socket as { remoteAddress?: string })?.remoteAddress;
  return addr ?? null;
}

function actor(user: AuthUser, req: Request): SettingsActor {
  return { actorId: user.id, ip: clientIp(req) };
}

@ApiTags('admin-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list(@Query('group') group?: string) {
    const g =
      group && (SETTING_GROUPS as readonly string[]).includes(group)
        ? (group as SettingGroup)
        : undefined;
    return this.settings.listForAdmin(g);
  }

  @Get(':key')
  async getOne(@Param('key') key: string) {
    const row = await this.settings.getByKey(key);
    if (!row) throw new NotFoundException(`Setting not found: ${key}`);
    return row;
  }

  @Post()
  @UsePipes(new ZodValidationPipe(settingUpsertInput))
  upsert(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: SettingUpsertInput) {
    return this.settings.upsert(actor(user, req), body);
  }

  @Post('bulk')
  @UsePipes(new ZodValidationPipe(bulkSettingUpsertInput))
  bulkUpsert(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: BulkSettingUpsertInput) {
    return this.settings.upsertMany(actor(user, req), body);
  }

  @Delete(':key')
  async remove(@CurrentUser() user: AuthUser, @Req() req: Request, @Param('key') key: string) {
    await this.settings.delete(actor(user, req), key);
    return { ok: true };
  }
}

@ApiTags('public')
@Controller('public/settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.listPublic();
  }
}
