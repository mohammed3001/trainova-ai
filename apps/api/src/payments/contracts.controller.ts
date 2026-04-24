import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createContractInputSchema,
  fundMilestoneInputSchema,
  refundMilestoneInputSchema,
  releaseMilestoneInputSchema,
  type CreateContractInput,
  type FundMilestoneInput,
  type RefundMilestoneInput,
  type ReleaseMilestoneInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(createContractInputSchema))
  create(@CurrentUser() user: AuthUser, @Body() body: CreateContractInput) {
    return this.payments.createContract(user.id, body);
  }

  @Get('mine/company')
  @Roles('COMPANY_OWNER')
  listForCompany(@CurrentUser() user: AuthUser) {
    return this.payments.listContractsForCompany(user.id);
  }

  @Get('mine/trainer')
  @Roles('TRAINER')
  listForTrainer(@CurrentUser() user: AuthUser) {
    return this.payments.listContractsForTrainer(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.getContract(user.id, id);
  }

  @Post(':id/milestones/:milestoneId/fund')
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(fundMilestoneInputSchema))
  fund(
    @CurrentUser() user: AuthUser,
    @Param('milestoneId') milestoneId: string,
    @Body() body: FundMilestoneInput,
  ) {
    return this.payments.fundMilestone(user.id, milestoneId, body);
  }

  @Post(':id/milestones/:milestoneId/release')
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(releaseMilestoneInputSchema))
  release(
    @CurrentUser() user: AuthUser,
    @Param('milestoneId') milestoneId: string,
    @Body() body: ReleaseMilestoneInput,
  ) {
    return this.payments.releaseMilestone(user.id, milestoneId, body);
  }

  @Post(':id/milestones/:milestoneId/refund')
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(refundMilestoneInputSchema))
  refund(
    @CurrentUser() user: AuthUser,
    @Param('milestoneId') milestoneId: string,
    @Body() body: RefundMilestoneInput,
  ) {
    return this.payments.refundMilestone(user.id, milestoneId, body);
  }
}
