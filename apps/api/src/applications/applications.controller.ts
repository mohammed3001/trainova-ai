import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import {
  applyToRequestSchema,
  assignTestSchema,
  updateApplicationStatusSchema,
  type ApplyToRequestInput,
  type AssignTestInput,
  type UpdateApplicationStatusInput,
} from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import { TestsService } from '../tests/tests.service';

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly service: ApplicationsService,
    private readonly tests: TestsService,
  ) {}

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
  @UsePipes(new ZodValidationPipe(updateApplicationStatusSchema))
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateApplicationStatusInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.service.updateStatus(user.id, id, body.status, body.note, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      locale: acceptLanguage?.split(',')[0]?.trim() ?? null,
    });
  }

  @Post(':id/assign-test')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(assignTestSchema))
  assignTest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AssignTestInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.service.assignTest(user.id, id, body.testId, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      locale: acceptLanguage?.split(',')[0]?.trim() ?? null,
    });
  }

  @Get(':id/history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.history(user.id, id);
  }

  @Get(':id/attempts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  attempts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tests.listAttemptsForApplication(user.id, user.role, id);
  }

  @Get(':id/assigned-test')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  assignedTest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tests.getAssignedTestForApplication(user.id, user.role, id);
  }

  @Get(':id/attachments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  attachments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listAttachments(user.id, id);
  }
}
