import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { applyToRequestSchema, ApplicationStatuses, type ApplyToRequestInput } from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import { BadRequestException } from '@nestjs/common';

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listMine(user.id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  @UsePipes(new ZodValidationPipe(applyToRequestSchema))
  apply(@CurrentUser() user: AuthUser, @Body() body: ApplyToRequestInput) {
    return this.service.apply(user.id, body);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    if (!ApplicationStatuses.includes(body.status as (typeof ApplicationStatuses)[number])) {
      throw new BadRequestException('Invalid status');
    }
    return this.service.updateStatus(user.id, id, body.status as (typeof ApplicationStatuses)[number]);
  }
}
