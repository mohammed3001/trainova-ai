import { Body, Controller, Get, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { submitVerificationSchema } from '@trainova/shared';
import type { SubmitVerificationInput, UserRole } from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VerificationService } from './verification.service';

function clientIp(req: Request): string | null {
  const addr = (req.socket as { remoteAddress?: string })?.remoteAddress;
  return addr ?? null;
}

@ApiTags('verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_OWNER', 'TRAINER')
@Controller('verification')
export class VerificationController {
  constructor(private readonly svc: VerificationService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(submitVerificationSchema))
  submit(@CurrentUser() user: AuthUser, @Body() body: SubmitVerificationInput, @Req() req: Request) {
    return this.svc.submit(
      { userId: user.id, role: user.role as UserRole, ip: clientIp(req) },
      body,
    );
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.listMine({ userId: user.id, role: user.role as UserRole });
  }
}
