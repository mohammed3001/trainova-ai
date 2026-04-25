import {
  Body,
  Controller,
  Delete,
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
  adminCancelSubscriptionInput,
  adminContractsQuery,
  adminPayoutsQuery,
  adminPlanInput,
  adminPlanUpdateInput,
  adminRefundMilestoneInput,
  adminSubscriptionsQuery,
  type AdminCancelSubscriptionInput,
  type AdminContractsQuery,
  type AdminPayoutsQuery,
  type AdminPlanInput,
  type AdminPlanUpdateInput,
  type AdminRefundMilestoneInput,
  type AdminSubscriptionsQuery,
  ADMIN_ROLE_GROUPS,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp } from '../common/client-ip.util';
import { AdminFinanceService } from './admin-finance.service';

function actor(user: AuthUser, req: Request) {
  return { actorId: user.id, ip: clientIp(req) };
}

@ApiTags('admin-finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.FINANCE)
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(private readonly finance: AdminFinanceService) {}

  @Get('overview')
  overview() {
    return this.finance.overview();
  }

  // ---------- Contracts ----------

  @Get('contracts')
  @UsePipes(new ZodValidationPipe(adminContractsQuery))
  listContracts(@Query() q: AdminContractsQuery) {
    return this.finance.listContracts(q);
  }

  @Get('contracts/:id')
  getContract(@Param('id') id: string) {
    return this.finance.getContract(id);
  }

  @Post('milestones/:id/refund')
  @UsePipes(new ZodValidationPipe(adminRefundMilestoneInput))
  refundMilestone(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminRefundMilestoneInput,
  ) {
    return this.finance.refundMilestone(actor(user, req), id, body);
  }

  // ---------- Payouts ----------

  @Get('payouts')
  @UsePipes(new ZodValidationPipe(adminPayoutsQuery))
  listPayouts(@Query() q: AdminPayoutsQuery) {
    return this.finance.listPayouts(q);
  }

  @Post('payouts/:id/retry')
  retryPayout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.finance.retryPayout(actor(user, req), id);
  }

  @Post('payouts/:id/cancel')
  cancelPayout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.finance.cancelPayout(actor(user, req), id);
  }

  // ---------- Subscriptions ----------

  @Get('subscriptions')
  @UsePipes(new ZodValidationPipe(adminSubscriptionsQuery))
  listSubscriptions(@Query() q: AdminSubscriptionsQuery) {
    return this.finance.listSubscriptions(q);
  }

  @Post('subscriptions/:id/cancel')
  @UsePipes(new ZodValidationPipe(adminCancelSubscriptionInput))
  cancelSubscription(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminCancelSubscriptionInput,
  ) {
    return this.finance.cancelSubscription(actor(user, req), id, body);
  }

  // ---------- Plans ----------

  @Get('plans')
  listPlans() {
    return this.finance.listPlans();
  }

  @Post('plans')
  @UsePipes(new ZodValidationPipe(adminPlanInput))
  createPlan(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: AdminPlanInput,
  ) {
    return this.finance.createPlan(actor(user, req), body);
  }

  @Patch('plans/:id')
  @UsePipes(new ZodValidationPipe(adminPlanUpdateInput))
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminPlanUpdateInput,
  ) {
    return this.finance.updatePlan(actor(user, req), id, body);
  }

  @Delete('plans/:id')
  deletePlan(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.finance.deletePlan(actor(user, req), id);
  }
}
