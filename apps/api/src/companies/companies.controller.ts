import { Body, Controller, Get, Param, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { updateCompanySchema, type UpdateCompanyInput } from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CompaniesService } from './companies.service';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER', 'COMPANY_MEMBER')
  findMe(@CurrentUser() user: AuthUser) {
    return this.companies.findMe(user.id);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(updateCompanySchema))
  updateMe(@CurrentUser() user: AuthUser, @Body() body: UpdateCompanyInput) {
    return this.companies.updateMe(user.id, body);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.companies.findBySlug(slug);
  }
}
