import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import {
  createTestSchema,
  gradeAttemptSchema,
  submitAttemptSchema,
  updateTestSchema,
  type CreateTestInput,
  type GradeAttemptInput,
  type SubmitAttemptInput,
  type UpdateTestInput,
} from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TestsService } from './tests.service';

@ApiTags('tests')
@Controller('tests')
export class TestsController {
  constructor(private readonly service: TestsService) {}

  // =========================================================================
  // Company — authoring
  // =========================================================================

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  listForRequest(@CurrentUser() user: AuthUser, @Query('requestId') requestId: string) {
    return this.service.listForRequest(user.id, requestId);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(createTestSchema))
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTestInput) {
    return this.service.create(user.id, body);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(updateTestSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateTestInput,
  ) {
    return this.service.update(user.id, id, body);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  // =========================================================================
  // Shared — fetch a test (ownership checked inside)
  // =========================================================================

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  mineAttempts(@CurrentUser() user: AuthUser) {
    return this.service.listAttemptsForTrainer(user.id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOneForUser(user.id, user.role, id);
  }

  // =========================================================================
  // Trainer — taking
  // =========================================================================

  @Post(':id/attempts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { applicationId?: string },
  ) {
    if (!body?.applicationId) {
      throw new BadRequestException('applicationId is required');
    }
    return this.service.startAttempt(user.id, id, body.applicationId);
  }

  @Post('attempts/:attemptId/submit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  @UsePipes(new ZodValidationPipe(submitAttemptSchema))
  submit(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() body: SubmitAttemptInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.service.submitAttempt(user.id, attemptId, body, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      locale: acceptLanguage?.split(',')[0]?.trim() ?? null,
    });
  }

  // =========================================================================
  // Company — reviewing / grading
  // =========================================================================

  @Get('attempts/:attemptId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  findAttempt(@CurrentUser() user: AuthUser, @Param('attemptId') attemptId: string) {
    return this.service.findAttempt(user.id, user.role, attemptId);
  }

  @Post('attempts/:attemptId/grade')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(gradeAttemptSchema))
  grade(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() body: GradeAttemptInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.service.gradeAttempt(user.id, attemptId, body, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      locale: acceptLanguage?.split(',')[0]?.trim() ?? null,
    });
  }
}
