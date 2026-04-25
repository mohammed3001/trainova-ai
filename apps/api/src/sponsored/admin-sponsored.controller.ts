import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  adminCreateSponsoredSchema,
  adminListSponsoredQuerySchema,
  adminUpdateSponsoredSchema,
  type AdminCreateSponsoredInput,
  type AdminListSponsoredQuery,
  type AdminUpdateSponsoredInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SponsoredService } from './sponsored.service';

@ApiTags('admin/sponsored')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/sponsored')
export class AdminSponsoredController {
  constructor(private readonly service: SponsoredService) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(adminListSponsoredQuerySchema))
  list(@Query() query: AdminListSponsoredQuery) {
    return this.service.adminList(query);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(adminCreateSponsoredSchema))
  create(
    @CurrentUser() admin: AuthUser,
    @Body() body: AdminCreateSponsoredInput,
  ) {
    return this.service.adminCreate(admin.id, body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(adminUpdateSponsoredSchema))
  update(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() body: AdminUpdateSponsoredInput,
  ) {
    return this.service.adminUpdate(admin.id, id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  delete(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.service.adminDelete(admin.id, id);
  }
}
