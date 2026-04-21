import { Body, Controller, Get, Param, Patch, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { updateTrainerProfileSchema, type UpdateTrainerProfileInput } from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TrainersService } from './trainers.service';

@ApiTags('trainers')
@Controller('trainers')
export class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @Get()
  list(
    @Query('skill') skill?: string,
    @Query('country') country?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.trainers.listPublic({
      skill,
      country,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  findMe(@CurrentUser() user: AuthUser) {
    return this.trainers.findMe(user.id);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  @UsePipes(new ZodValidationPipe(updateTrainerProfileSchema))
  updateMe(@CurrentUser() user: AuthUser, @Body() body: UpdateTrainerProfileInput) {
    return this.trainers.updateMe(user.id, body);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.trainers.findBySlug(slug);
  }
}
