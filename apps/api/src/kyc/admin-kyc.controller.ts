import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ADMIN_ROLE_GROUPS,
  adminListKycQuerySchema,
  reviewKycSchema,
  type AdminListKycQuery,
  type ReviewKycInput,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp } from '../common/client-ip.util';
import { KycService } from './kyc.service';

@ApiTags('admin-kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.MODERATION)
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly svc: KycService) {}

  @Get('sessions')
  list(@Query(new ZodValidationPipe(adminListKycQuerySchema)) query: AdminListKycQuery) {
    return this.svc.listForAdmin(query);
  }

  @Get('sessions/:id')
  getOne(@Param('id') id: string) {
    return this.svc.getOneForAdmin(id);
  }

  @Post('sessions/:id/review')
  review(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewKycSchema)) body: ReviewKycInput,
    @Req() req: Request,
  ) {
    return this.svc.review(admin.id, id, body, clientIp(req));
  }

  @Post('users/:userId/revoke')
  revoke(
    @CurrentUser() admin: AuthUser,
    @Param('userId') userId: string,
    @Body() body: { reason: string },
    @Req() req: Request,
  ) {
    return this.svc.revokeVerification(admin.id, userId, body?.reason ?? '', clientIp(req));
  }
}
