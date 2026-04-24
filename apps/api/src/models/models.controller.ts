import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  modelConnectionInputSchema,
  modelConnectionUpdateSchema,
  type ModelConnectionInput,
  type ModelConnectionUpdate,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ModelsService } from './models.service';

@ApiTags('models')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_OWNER')
@Controller()
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Get('companies/:companyId/models')
  list(@CurrentUser() user: AuthUser, @Param('companyId') companyId: string) {
    return this.models.list(user.id, companyId);
  }

  @Post('companies/:companyId/models')
  @UsePipes(new ZodValidationPipe(modelConnectionInputSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Param('companyId') companyId: string,
    @Body() body: ModelConnectionInput,
  ) {
    return this.models.create(user.id, companyId, body);
  }

  @Get('models/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.models.get(user.id, id);
  }

  @Patch('models/:id')
  @UsePipes(new ZodValidationPipe(modelConnectionUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ModelConnectionUpdate,
  ) {
    return this.models.update(user.id, id, body);
  }

  @Delete('models/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.models.remove(user.id, id);
  }

  @Post('models/:id/test')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.models.test(user.id, id);
  }
}
