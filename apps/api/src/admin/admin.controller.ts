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
  adminAnalyticsRangeSchema,
  adminListAttemptsQuerySchema,
  adminListCompaniesQuerySchema,
  adminListConversationsQuerySchema,
  adminListReportsQuerySchema,
  adminListRequestsQuerySchema,
  adminListTestsQuerySchema,
  adminListTrainersQuerySchema,
  adminListUsersQuerySchema,
  adminListVerificationQuerySchema,
  adminLockConversationSchema,
  adminRedactMessageSchema,
  adminSetRequestFeaturedSchema,
  adminSetRequestStatusSchema,
  adminSetUserRoleSchema,
  adminSetUserStatusSchema,
  adminSetVerifiedSchema,
  reviewReportSchema,
  reviewVerificationSchema,
  ADMIN_ROLE_GROUPS,
} from '@trainova/shared';
import type {
  AdminAnalyticsRange,
  AdminListAttemptsQuery,
  AdminListCompaniesQuery,
  AdminListConversationsQuery,
  AdminListReportsQuery,
  AdminListRequestsQuery,
  AdminListTestsQuery,
  AdminListTrainersQuery,
  AdminListUsersQuery,
  AdminListVerificationQuery,
  AdminLockConversationInput,
  AdminRedactMessageInput,
  AdminSetRequestFeaturedInput,
  AdminSetRequestStatusInput,
  AdminSetUserRoleInput,
  AdminSetUserStatusInput,
  AdminSetVerifiedInput,
  ReviewReportInput,
  ReviewVerificationInput,
  UserRole,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp } from '../common/client-ip.util';
import { AdminService, AdminContext } from './admin.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminReportsService } from './admin-reports.service';
import { VerificationService } from '../verification/verification.service';

function ctx(user: AuthUser, req: Request): AdminContext {
  return { actorId: user.id, actorRole: user.role as UserRole, ip: clientIp(req) };
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.ALL)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly ops: AdminOpsService,
    private readonly reports: AdminReportsService,
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

  // Verification queue (MODERATOR/SUPPORT may review identity & business docs).
  @Get('verification')
  @Roles(...ADMIN_ROLE_GROUPS.VERIFICATION)
  @UsePipes(new ZodValidationPipe(adminListVerificationQuerySchema))
  verificationList(@Query() q: AdminListVerificationQuery) {
    return this.verification.listForAdmin(q);
  }

  @Get('verification/:id')
  @Roles(...ADMIN_ROLE_GROUPS.VERIFICATION)
  verificationGet(@Param('id') id: string) {
    return this.verification.getForAdmin(id);
  }

  @Post('verification/:id/review')
  @Roles(...ADMIN_ROLE_GROUPS.VERIFICATION)
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

  // ---------------------------------------------------------------------------
  // T5.B — job requests (admin view across all companies)
  // ---------------------------------------------------------------------------

  @Get('requests')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(adminListRequestsQuerySchema))
  listRequests(@Query() q: AdminListRequestsQuery) {
    return this.ops.listRequests(q);
  }

  @Get('requests/:id')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  getRequest(@Param('id') id: string) {
    return this.ops.getRequest(id);
  }

  @Patch('requests/:id/status')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(adminSetRequestStatusSchema))
  setRequestStatus(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminSetRequestStatusInput,
  ) {
    return this.ops.setRequestStatus(ctx(user, req), id, body.status, body.reason);
  }

  @Patch('requests/:id/featured')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(adminSetRequestFeaturedSchema))
  setRequestFeatured(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminSetRequestFeaturedInput,
  ) {
    return this.ops.setRequestFeatured(ctx(user, req), id, body.featured);
  }

  // ---------------------------------------------------------------------------
  // T5.B — tests (admin view across all companies) + attempts
  // ---------------------------------------------------------------------------

  @Get('tests')
  @UsePipes(new ZodValidationPipe(adminListTestsQuerySchema))
  listTests(@Query() q: AdminListTestsQuery) {
    return this.ops.listTests(q);
  }

  @Get('tests/:id')
  getTest(@Param('id') id: string) {
    return this.ops.getTest(id);
  }

  @Get('attempts')
  @UsePipes(new ZodValidationPipe(adminListAttemptsQuerySchema))
  listAttempts(@Query() q: AdminListAttemptsQuery) {
    return this.ops.listAttempts(q);
  }

  @Get('attempts/:id')
  getAttempt(@Param('id') id: string) {
    return this.ops.getAttempt(id);
  }

  // ---------------------------------------------------------------------------
  // T5.B — chat moderation (conversations + messages)
  // ---------------------------------------------------------------------------

  @Get('conversations')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(adminListConversationsQuerySchema))
  listConversations(@Query() q: AdminListConversationsQuery) {
    return this.ops.listConversations(q);
  }

  @Get('conversations/:id')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  getConversation(@Param('id') id: string) {
    return this.ops.getConversation(id);
  }

  @Post('conversations/:id/lock')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(adminLockConversationSchema))
  lockConversation(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminLockConversationInput,
  ) {
    return this.ops.setConversationLocked(ctx(user, req), id, body.locked, body.reason);
  }

  @Post('messages/:id/redact')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(adminRedactMessageSchema))
  redactMessage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminRedactMessageInput,
  ) {
    return this.ops.redactMessage(ctx(user, req), id, body.reason);
  }

  // ---------------------------------------------------------------------------
  // T5.B — moderation reports queue
  // ---------------------------------------------------------------------------

  @Get('reports')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(adminListReportsQuerySchema))
  listReports(@Query() q: AdminListReportsQuery) {
    return this.reports.listForAdmin(q);
  }

  @Get('reports/:id')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  getReport(@Param('id') id: string) {
    return this.reports.getForAdmin(id);
  }

  @Post('reports/:id/review')
  @Roles(...ADMIN_ROLE_GROUPS.MODERATION)
  @UsePipes(new ZodValidationPipe(reviewReportSchema))
  reviewReport(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: ReviewReportInput,
  ) {
    return this.reports.review(ctx(user, req), id, body);
  }

  // ---------------------------------------------------------------------------
  // T5.B — analytics time-series
  // ---------------------------------------------------------------------------

  @Get('analytics')
  @UsePipes(new ZodValidationPipe(adminAnalyticsRangeSchema))
  analytics(@Query() q: AdminAnalyticsRange) {
    return this.ops.analytics(q.days);
  }

  // Legacy helper kept for skill lookup widgets.
  @Get('skills')
  skills() {
    return this.admin.listSkills();
  }
}
