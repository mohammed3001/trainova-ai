import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  listTemplatesQuerySchema,
  type ListTemplatesQuery,
} from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContractTemplatesService } from './contract-templates.service';

/**
 * Authenticated read-only surface for company owners and trainers, who
 * need to know which templates are available to choose from when an
 * admin authors a document. Filters to PUBLISHED only.
 */
@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contract-templates')
export class ContractTemplatesPublicController {
  constructor(private readonly service: ContractTemplatesService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(listTemplatesQuerySchema))
  list(@Query() query: ListTemplatesQuery) {
    return this.service.listPublished({ kind: query.kind, locale: query.locale });
  }
}
