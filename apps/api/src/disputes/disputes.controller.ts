import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  adminDisputeUpdateSchema,
  disputeListQuerySchema,
  raiseDisputeInputSchema,
  type AdminDisputeUpdateInput,
  type DisputeListQuery,
  type RaiseDisputeInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DisputesService } from './disputes.service';

@ApiTags('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  // ---- party-side ----

  @Post('disputes')
  @Roles('COMPANY_OWNER', 'TRAINER')
  @UsePipes(new ZodValidationPipe(raiseDisputeInputSchema))
  raise(@CurrentUser() user: AuthUser, @Body() body: RaiseDisputeInput) {
    return this.disputes.raise(user.id, body);
  }

  @Get('disputes/mine')
  @Roles('COMPANY_OWNER', 'TRAINER')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(disputeListQuerySchema)) query: DisputeListQuery,
  ) {
    return this.disputes.listForActor(user.id, query);
  }

  @Get('disputes/:id')
  @Roles('COMPANY_OWNER', 'TRAINER')
  getMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disputes.getForActor(user.id, id);
  }

  @Patch('disputes/:id/withdraw')
  @Roles('COMPANY_OWNER', 'TRAINER')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disputes.withdraw(user.id, id).then(() => ({ ok: true }));
  }

  // ---- admin ----

  @Get('admin/disputes')
  @Roles('SUPER_ADMIN', 'ADMIN')
  listAdmin(
    @Query(new ZodValidationPipe(disputeListQuerySchema)) query: DisputeListQuery,
  ) {
    return this.disputes.listForAdmin(query);
  }

  @Get('admin/disputes/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getAdmin(@Param('id') id: string) {
    return this.disputes.getForAdmin(id);
  }

  @Patch('admin/disputes/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @UsePipes(new ZodValidationPipe(adminDisputeUpdateSchema))
  adminUpdate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AdminDisputeUpdateInput,
  ) {
    return this.disputes.adminUpdate(user.id, id, body);
  }
}
