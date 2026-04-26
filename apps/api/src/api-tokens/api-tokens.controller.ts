import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createApiTokenSchema, type CreateApiTokenInput } from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiTokensService } from './api-tokens.service';

/**
 * Company-scoped CRUD over JWT. Token issuance is restricted to
 * `OWNER` / `ADMIN` of the calling user's company — the service layer
 * enforces this via {@link ApiTokensService.requireAdminCompany}.
 */
@ApiTags('api-tokens')
@Controller('company/api-tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  async list(@CurrentUser() caller: AuthUser) {
    const { companyId } = await this.tokens.requireAdminCompany(caller.id);
    const items = await this.tokens.listForCompany(companyId);
    return { items };
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createApiTokenSchema))
  async create(@CurrentUser() caller: AuthUser, @Body() body: CreateApiTokenInput) {
    const { companyId } = await this.tokens.requireAdminCompany(caller.id);
    return this.tokens.create(companyId, caller.id, body);
  }

  @Delete(':id')
  async revoke(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    const { companyId } = await this.tokens.requireAdminCompany(caller.id);
    return this.tokens.revoke(companyId, caller.id, id);
  }
}
