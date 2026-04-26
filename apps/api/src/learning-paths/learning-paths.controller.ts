import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_ROLE_GROUPS,
  completeLearningStepSchema,
  createLearningPathSchema,
  listLearningPathsQuerySchema,
  replaceLearningStepsSchema,
  setLearningPathPublishSchema,
  updateLearningPathSchema,
  type CompleteLearningStepInput,
  type CreateLearningPathInput,
  type ListLearningPathsQuery,
  type ReplaceLearningStepsInput,
  type SetLearningPathPublishInput,
  type UpdateLearningPathInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LearningPathsService } from './learning-paths.service';

/**
 * Public catalog and per-user enrollment surface.
 *
 * Anonymous endpoints (`GET /learning-paths`, `GET /learning-paths/:slug`,
 * `GET /learning-paths/certificates/:serial`) MUST stay outside the
 * `JwtAuthGuard` — they are scraped by the marketing site and read
 * by employers verifying a candidate's certificate.
 *
 * Authenticated endpoints sit on the same controller for URL locality
 * but apply `@UseGuards(JwtAuthGuard)` per-handler.
 */
@ApiTags('learning-paths')
@Controller('learning-paths')
export class LearningPathsController {
  constructor(private readonly service: LearningPathsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listLearningPathsQuerySchema))
    query: ListLearningPathsQuery,
  ) {
    return this.service.listPublic(query);
  }

  @Get('me/enrollments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  myEnrollments(@CurrentUser() user: AuthUser) {
    return this.service.listMyEnrollments(user.id);
  }

  @Get('certificates/:serial')
  verifyCertificate(@Param('serial') serial: string) {
    return this.service.verifyCertificate(serial);
  }

  @Get(':slug')
  getPublic(@Param('slug') slug: string) {
    return this.service.getPublicBySlug(slug);
  }

  @Get(':slug/enrollment')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  myEnrollment(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.service.getMyEnrollment(user.id, slug);
  }

  @Post(':slug/enroll')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  enroll(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.service.enroll(user.id, slug);
  }

  @Delete(':slug/enroll')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  unenroll(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.service.unenroll(user.id, slug);
  }

  @Post(':slug/complete-next')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  completeNext(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(completeLearningStepSchema))
    body: CompleteLearningStepInput,
  ) {
    return this.service.completeNextStep(user.id, slug, body);
  }
}

/**
 * Admin authoring surface — gated to CONTENT group (CONTENT_MANAGER,
 * ADMIN, SUPER_ADMIN). Lives on `/admin/learning-paths` so the
 * existing admin page guards (`requireAdminGroup`) apply uniformly.
 */
@ApiTags('admin-learning-paths')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.CONTENT)
@Controller('admin/learning-paths')
export class AdminLearningPathsController {
  constructor(private readonly service: LearningPathsService) {}

  @Get()
  list() {
    return this.service.adminList();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.adminGet(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createLearningPathSchema))
    body: CreateLearningPathInput,
  ) {
    return this.service.adminCreate(user.id, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLearningPathSchema))
    body: UpdateLearningPathInput,
  ) {
    return this.service.adminUpdate(id, body);
  }

  @Put(':id/steps')
  replaceSteps(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceLearningStepsSchema))
    body: ReplaceLearningStepsInput,
  ) {
    return this.service.adminReplaceSteps(id, body);
  }

  @Patch(':id/publish')
  setPublish(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setLearningPathPublishSchema))
    body: SetLearningPathPublishInput,
  ) {
    return this.service.adminSetPublish(id, body.isPublished);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.adminDelete(id);
  }
}
