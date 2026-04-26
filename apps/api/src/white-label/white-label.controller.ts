import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_ROLE_GROUPS,
  applyBrandingPresetSchema,
  linkAgencySchema,
  updateBrandingSchema,
  type ApplyBrandingPresetInput,
  type LinkAgencyInput,
  type UpdateBrandingInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WhiteLabelService } from './white-label.service';

/**
 * Owner-facing branding endpoints. All require COMPANY_OWNER (the
 * service layer also asserts ownership via `findUnique({ ownerId })`).
 */
@ApiTags('white-label')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_OWNER')
@Controller('companies/me/branding')
export class WhiteLabelOwnerController {
  constructor(private readonly service: WhiteLabelService) {}

  @Get()
  getMyBranding(@CurrentUser() user: AuthUser) {
    return this.service.getMyBranding(user.id);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(updateBrandingSchema))
  updateMyBranding(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateBrandingInput,
  ) {
    return this.service.updateMyBranding(user.id, body);
  }

  @Post('preset')
  @UsePipes(new ZodValidationPipe(applyBrandingPresetSchema))
  applyMyPreset(
    @CurrentUser() user: AuthUser,
    @Body() body: ApplyBrandingPresetInput,
  ) {
    return this.service.applyMyPreset(user.id, body);
  }
}

/**
 * Owner-facing roll-up of child companies, when the owner's company
 * has been designated by an admin as an agency parent.
 */
@ApiTags('white-label')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_OWNER')
@Controller('companies/me/agency')
export class WhiteLabelAgencyController {
  constructor(private readonly service: WhiteLabelService) {}

  @Get('children')
  listMyChildCompanies(@CurrentUser() user: AuthUser) {
    return this.service.listMyChildCompanies(user.id);
  }
}

/**
 * Admin-facing agency linking. Lives under /admin/agencies so the
 * existing admin layout guards apply.
 */
@ApiTags('admin-white-label')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.CONTENT)
@Controller('admin/agencies')
export class AdminAgenciesController {
  constructor(private readonly service: WhiteLabelService) {}

  @Get()
  list() {
    return this.service.adminListAgencies();
  }

  /**
   * Set or clear `parentAgencyId` on a single company. Body
   * `{ parentCompanyId: null }` clears it.
   */
  @Patch(':companyId/parent')
  @UsePipes(new ZodValidationPipe(linkAgencySchema))
  setParent(
    @Param('companyId') companyId: string,
    @Body() body: LinkAgencyInput,
  ) {
    return this.service.adminSetParentAgency(companyId, body);
  }
}

/**
 * Public branding lookup by slug. No auth — used by the per-company
 * branded marketing pages and any embed surface.
 */
@ApiTags('white-label')
@Controller('public/companies')
export class WhiteLabelPublicController {
  constructor(private readonly service: WhiteLabelService) {}

  @Get(':slug/branding')
  getPublicBrandingBySlug(@Param('slug') slug: string) {
    return this.service.getPublicBrandingBySlug(slug);
  }
}
