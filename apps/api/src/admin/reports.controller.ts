import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { createReportSchema } from '@trainova/shared';
import type { CreateReportInput } from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminReportsService } from './admin-reports.service';

function clientIp(req: Request): string | null {
  const addr = (req.socket as { remoteAddress?: string })?.remoteAddress;
  return addr ?? null;
}

/**
 * Public reports endpoints — available to any authenticated user. Users can
 * submit reports against any target (message, conversation, trainer, company,
 * request, review, etc.) and see the history of what they reported.
 *
 * Admin review lives on the `AdminController` at `/admin/reports/*`.
 */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createReportSchema))
  submit(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: CreateReportInput,
  ) {
    return this.reports.submit(user.id, clientIp(req), body);
  }

  @Get('mine')
  mine(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : undefined;
    return this.reports.listMine(user.id, Number.isFinite(n) ? (n as number) : undefined, cursor);
  }
}
