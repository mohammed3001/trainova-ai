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
  adminListArticlesQuerySchema,
  adminListFaqQuerySchema,
  adminListPagesQuerySchema,
  upsertArticleSchema,
  upsertCategorySchema,
  upsertFaqEntrySchema,
  upsertFeatureFlagSchema,
  upsertPageSchema,
  type AdminListArticlesQuery,
  type AdminListFaqQuery,
  type AdminListPagesQuery,
  type UpsertArticleInput,
  type UpsertCategoryInput,
  type UpsertFaqEntryInput,
  type UpsertFeatureFlagInput,
  type UpsertPageInput,
  type UserRole,
  ADMIN_ROLE_GROUPS,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { AdminContext } from '../admin/admin.service';
import { CmsService } from './cms.service';

function clientIp(req: Request): string | null {
  const addr = (req.socket as { remoteAddress?: string })?.remoteAddress;
  return addr ?? null;
}

function ctx(user: AuthUser, req: Request): AdminContext {
  return { actorId: user.id, actorRole: user.role as UserRole, ip: clientIp(req) };
}

@ApiTags('admin-cms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.CONTENT)
@Controller('admin/cms')
export class AdminCmsController {
  constructor(private readonly cms: CmsService) {}

  // Pages --------------------------------------------------------------------

  @Get('pages')
  @UsePipes(new ZodValidationPipe(adminListPagesQuerySchema))
  listPages(@Query() q: AdminListPagesQuery) {
    return this.cms.listPages(q);
  }

  @Get('pages/:id')
  getPage(@Param('id') id: string) {
    return this.cms.getPage(id);
  }

  @Post('pages')
  @UsePipes(new ZodValidationPipe(upsertPageSchema))
  createPage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: UpsertPageInput,
  ) {
    return this.cms.upsertPage(ctx(user, req), null, body);
  }

  @Patch('pages/:id')
  @UsePipes(new ZodValidationPipe(upsertPageSchema))
  updatePage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpsertPageInput,
  ) {
    return this.cms.upsertPage(ctx(user, req), id, body);
  }

  @Delete('pages/:id')
  deletePage(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.cms.deletePage(ctx(user, req), id);
  }

  // Categories ---------------------------------------------------------------

  @Get('categories')
  listCategories() {
    return this.cms.listCategories();
  }

  @Get('categories/:id')
  getCategory(@Param('id') id: string) {
    return this.cms.getCategory(id);
  }

  @Post('categories')
  @UsePipes(new ZodValidationPipe(upsertCategorySchema))
  createCategory(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: UpsertCategoryInput,
  ) {
    return this.cms.upsertCategory(ctx(user, req), null, body);
  }

  @Patch('categories/:id')
  @UsePipes(new ZodValidationPipe(upsertCategorySchema))
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpsertCategoryInput,
  ) {
    return this.cms.upsertCategory(ctx(user, req), id, body);
  }

  @Delete('categories/:id')
  deleteCategory(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.cms.deleteCategory(ctx(user, req), id);
  }

  // Articles -----------------------------------------------------------------

  @Get('articles')
  @UsePipes(new ZodValidationPipe(adminListArticlesQuerySchema))
  listArticles(@Query() q: AdminListArticlesQuery) {
    return this.cms.listArticles(q);
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return this.cms.getArticle(id);
  }

  @Post('articles')
  @UsePipes(new ZodValidationPipe(upsertArticleSchema))
  createArticle(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: UpsertArticleInput,
  ) {
    return this.cms.upsertArticle(ctx(user, req), null, body);
  }

  @Patch('articles/:id')
  @UsePipes(new ZodValidationPipe(upsertArticleSchema))
  updateArticle(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpsertArticleInput,
  ) {
    return this.cms.upsertArticle(ctx(user, req), id, body);
  }

  @Delete('articles/:id')
  deleteArticle(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.cms.deleteArticle(ctx(user, req), id);
  }

  // FAQ ---------------------------------------------------------------------

  @Get('faqs')
  @UsePipes(new ZodValidationPipe(adminListFaqQuerySchema))
  listFaq(@Query() q: AdminListFaqQuery) {
    return this.cms.listFaq(q);
  }

  @Get('faqs/:id')
  getFaq(@Param('id') id: string) {
    return this.cms.getFaq(id);
  }

  @Post('faqs')
  @UsePipes(new ZodValidationPipe(upsertFaqEntrySchema))
  createFaq(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: UpsertFaqEntryInput,
  ) {
    return this.cms.upsertFaq(ctx(user, req), null, body);
  }

  @Patch('faqs/:id')
  @UsePipes(new ZodValidationPipe(upsertFaqEntrySchema))
  updateFaq(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpsertFaqEntryInput,
  ) {
    return this.cms.upsertFaq(ctx(user, req), id, body);
  }

  @Delete('faqs/:id')
  deleteFaq(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.cms.deleteFaq(ctx(user, req), id);
  }

  // Feature flags ------------------------------------------------------------

  @Get('feature-flags')
  listFeatureFlags() {
    return this.cms.listFeatureFlags();
  }

  @Get('feature-flags/:key')
  getFeatureFlag(@Param('key') key: string) {
    return this.cms.getFeatureFlag(key);
  }

  @Post('feature-flags')
  @UsePipes(new ZodValidationPipe(upsertFeatureFlagSchema))
  upsertFeatureFlag(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: UpsertFeatureFlagInput,
  ) {
    return this.cms.upsertFeatureFlag(ctx(user, req), body);
  }

  @Delete('feature-flags/:key')
  deleteFeatureFlag(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('key') key: string,
  ) {
    return this.cms.deleteFeatureFlag(ctx(user, req), key);
  }
}
