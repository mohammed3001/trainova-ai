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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_ROLE_GROUPS,
  createCouponSchema,
  listCouponsQuerySchema,
  updateCouponSchema,
  type CreateCouponInput,
  type ListCouponsQuery,
  type UpdateCouponInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CouponsService } from './coupons.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.FINANCE)
@Controller('admin/coupons')
export class CouponsAdminController {
  constructor(private readonly service: CouponsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listCouponsQuerySchema))
    query: ListCouponsQuery,
  ) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCouponSchema))
    body: CreateCouponInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCouponSchema))
    body: UpdateCouponInput,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
