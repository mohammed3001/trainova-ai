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
  createContractTemplateInputSchema,
  listTemplatesQuerySchema,
  updateContractTemplateInputSchema,
  type CreateContractTemplateParsed,
  type ListTemplatesQuery,
  type UpdateContractTemplateInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContractTemplatesService } from './contract-templates.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('admin/contract-templates')
export class ContractTemplatesAdminController {
  constructor(private readonly service: ContractTemplatesService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(listTemplatesQuerySchema))
  list(@Query() query: ListTemplatesQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createContractTemplateInputSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateContractTemplateParsed,
  ) {
    return this.service.create(user.id, body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateContractTemplateInputSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateContractTemplateInput,
  ) {
    return this.service.update(id, user.id, body);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archive(id, user.id);
  }
}
