import { Body, Controller, Get, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  startKycSchema,
  submitKycSchema,
  type StartKycInput,
  type SubmitKycInput,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp } from '../common/client-ip.util';
import { KycService } from './kyc.service';

@ApiTags('kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly svc: KycService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.svc.getMine(user.id);
  }

  @Post('sessions')
  @UsePipes(new ZodValidationPipe(startKycSchema))
  start(@CurrentUser() user: AuthUser, @Body() body: StartKycInput, @Req() req: Request) {
    return this.svc.startOrResume(user.id, body, clientIp(req));
  }

  @Post('sessions/current/submit')
  @UsePipes(new ZodValidationPipe(submitKycSchema))
  submit(@CurrentUser() user: AuthUser, @Body() body: SubmitKycInput, @Req() req: Request) {
    return this.svc.submitDocuments(user.id, body, clientIp(req));
  }
}
