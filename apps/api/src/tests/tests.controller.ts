import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { TestsService } from './tests.service';

@ApiTags('tests')
@Controller('tests')
export class TestsController {
  constructor(private readonly service: TestsService) {}

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  mineAttempts(@CurrentUser() user: AuthUser) {
    return this.service.listAttemptsForTrainer(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/attempts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { applicationId?: string },
  ) {
    return this.service.startAttempt(user.id, id, body.applicationId);
  }

  @Post('attempts/:attemptId/submit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() body: { responses: Array<{ taskId: string; response: unknown }> },
  ) {
    return this.service.submitAttempt(user.id, attemptId, body.responses ?? []);
  }
}
