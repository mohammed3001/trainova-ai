import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  workbenchCallInputSchema,
  type WorkbenchCallInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WorkbenchService } from './workbench.service';

@ApiTags('workbench')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class WorkbenchController {
  constructor(private readonly workbench: WorkbenchService) {}

  @Get('applications/:applicationId/workbench/context')
  @Roles('TRAINER')
  getContext(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
  ) {
    return this.workbench.getContext(user.id, applicationId);
  }

  @Post('applications/:applicationId/workbench/call')
  @Roles('TRAINER')
  @UsePipes(new ZodValidationPipe(workbenchCallInputSchema))
  call(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() body: WorkbenchCallInput,
  ) {
    return this.workbench.call(user.id, applicationId, body);
  }

  @Get('applications/:applicationId/workbench/calls')
  @Roles('TRAINER')
  listMine(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.workbench.listCallsForTrainer(
      user.id,
      applicationId,
      limit ? Number.parseInt(limit, 10) : undefined,
    );
  }

  @Get('models/:id/calls')
  @Roles('COMPANY_OWNER')
  listForConnection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.workbench.listCallsForCompany(
      user.id,
      id,
      limit ? Number.parseInt(limit, 10) : undefined,
    );
  }
}
