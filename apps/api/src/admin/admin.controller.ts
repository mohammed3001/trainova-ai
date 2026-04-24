import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  adminListCompaniesQuerySchema,
  adminListTrainersQuerySchema,
  adminListUsersQuerySchema,
  adminListVerificationQuerySchema,
  adminSetUserRoleSchema,
  adminSetUserStatusSchema,
  adminSetVerifiedSchema,
  reviewVerificationSchema,
} from '@trainova/shared';
import type {
  AdminListCompaniesQuery,
  AdminListTrainersQuery,
  AdminListUsersQuery,
  AdminListVerificationQuery,
  AdminSetUserRoleInput,
  AdminSetUserStatusInput,
  AdminSetVerifiedInput,
  ReviewVerificationInput,
  UserRole,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminService, AdminContext } from './admin.service';
import { VerificationService } from '../verification/verification.service';

function clientIp(req: Request): string | null {
  const addr = (req.socket as { remoteAddress?: string })?.remoteAddress;
  return addr ?? null;
}

function ctx(user: AuthUser, req: Request): AdminContext {
  return { actorId: user.id, actorRole: user.role as UserRole, ip: clientIp(req) };
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly verification: VerificationService,
  ) {}

  // Dashboard
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  // Users
  @Get('users')
  @UsePipes(new ZodValidationPipe(adminListUsersQuerySchema))
  users(@Query() q: AdminListUsersQuery) {
    return this.admin.listUsers(q);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id/role')
  @UsePipes(new ZodValidationPipe(adminSetUserRoleSchema))
  setUserRole(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminSetUserRoleInput,
  ) {
    return this.admin.setUserRole(ctx(user, req), id, body.role);
  }

  @Patch('users/:id/status')
  @UsePipes(new ZodValidationPipe(adminSetUserStatusSchema))
  setUserStatus(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminSetUserStatusInput,
  ) {
    return this.admin.setUserStatus(ctx(user, req), id, body.status);
  }

  @Post('users/:id/mark-email-verified')
  markEmailVerified(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.admin.markEmailVerified(ctx(user, req), id);
  }

  @Post('users/:id/resend-verify')
  resendVerify(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.admin.resendVerificationEmail(ctx(user, req), id);
  }

  @Post('users/:id/trigger-password-reset')
  triggerPasswordReset(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.admin.triggerPasswordReset(ctx(user, req), id);
  }

  // Companies
  @Get('companies')
  @UsePipes(new ZodValidationPipe(adminListCompaniesQuerySchema))
  companies(@Query() q: AdminListCompaniesQuery) {
    return this.admin.listCompanies(q);
  }

  @Get('companies/:id')
  company(@Param('id') id: string) {
    return this.admin.getCompany(id);
  }

  @Patch('companies/:id/verified')
  @UsePipes(new ZodValidationPipe(adminSetVerifiedSchema))
  setCompanyVerified(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminSetVerifiedInput,
  ) {
    return this.admin.setCompanyVerified(ctx(user, req), id, body.verified);
  }

  // Trainers
  @Get('trainers')
  @UsePipes(new ZodValidationPipe(adminListTrainersQuerySchema))
  trainers(@Query() q: AdminListTrainersQuery) {
    return this.admin.listTrainers(q);
  }

  @Get('trainers/:id')
  trainer(@Param('id') id: string) {
    return this.admin.getTrainer(id);
  }

  @Patch('trainers/:id/verified')
  @UsePipes(new ZodValidationPipe(adminSetVerifiedSchema))
  setTrainerVerified(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminSetVerifiedInput,
  ) {
    return this.admin.setTrainerVerified(ctx(user, req), id, body.verified);
  }

  // Verification queue
  @Get('verification')
  @UsePipes(new ZodValidationPipe(adminListVerificationQuerySchema))
  verificationList(@Query() q: AdminListVerificationQuery) {
    return this.verification.listForAdmin(q);
  }

  @Get('verification/:id')
  verificationGet(@Param('id') id: string) {
    return this.verification.getForAdmin(id);
  }

  @Post('verification/:id/review')
  @UsePipes(new ZodValidationPipe(reviewVerificationSchema))
  verificationReview(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: ReviewVerificationInput,
  ) {
    return this.verification.review(
      { userId: user.id, role: user.role as UserRole, ip: clientIp(req) },
      id,
      body,
    );
  }

  // Legacy
  @Get('requests')
  requests() {
    return this.admin.listRequests();
  }

  @Get('skills')
  skills() {
    return this.admin.listSkills();
  }
}
