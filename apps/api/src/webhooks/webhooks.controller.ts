import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateWebhookSchema,
  ListWebhookDeliveriesQuerySchema,
  UpdateWebhookSchema,
  WEBHOOK_EVENT_TYPES,
  type CreateWebhookInput,
  type ListWebhookDeliveriesQuery,
  type UpdateWebhookInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CompaniesService } from '../companies/companies.service';
import { WebhooksService } from './webhooks.service';

/**
 * Company-owner facing webhook config. Resolves the caller's company
 * via `CompaniesService.findMe` so we never trust a `companyId` from
 * the wire — keeps every read/write strictly scoped to whichever
 * company the JWT subject owns.
 */
@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_OWNER')
@Controller('company/webhooks')
export class WebhooksController {
  constructor(
    private readonly service: WebhooksService,
    private readonly companies: CompaniesService,
  ) {}

  /** Surface the canonical event type list to the UI so the form can
   *  build checkboxes without duplicating the enum. */
  @Get('events')
  events() {
    return { events: WEBHOOK_EVENT_TYPES };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const company = await this.companies.findMe(user.id);
    return this.service.list(company.id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateWebhookSchema)) body: CreateWebhookInput,
  ) {
    const company = await this.companies.findMe(user.id);
    return this.service.create(company.id, body);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWebhookSchema)) body: UpdateWebhookInput,
  ) {
    const company = await this.companies.findMe(user.id);
    return this.service.update(company.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const company = await this.companies.findMe(user.id);
    await this.service.remove(company.id, id);
  }

  @Post(':id/rotate-secret')
  async rotate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const company = await this.companies.findMe(user.id);
    return this.service.rotateSecret(company.id, id);
  }

  @Get(':id/deliveries')
  async deliveries(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ListWebhookDeliveriesQuerySchema))
    q: ListWebhookDeliveriesQuery,
  ) {
    const company = await this.companies.findMe(user.id);
    return this.service.listDeliveries(company.id, id, q);
  }

  @Post(':id/deliveries/:deliveryId/redeliver')
  @HttpCode(HttpStatus.NO_CONTENT)
  async redeliver(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    const company = await this.companies.findMe(user.id);
    await this.service.redeliver(company.id, id, deliveryId);
  }
}
