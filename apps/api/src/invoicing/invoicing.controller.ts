import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { InvoiceListQuery, PublicTaxProfile } from '@trainova/shared';
import {
  taxProfileInputSchema,
  taxRuleInputSchema,
  ADMIN_ROLE_GROUPS,
} from '@trainova/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvoiceService } from './invoice.service';
import { TaxProfileService } from './tax-profile.service';
import { TaxService } from './tax.service';

const listQuerySchema = z.object({
  kind: z.enum(['PURCHASE', 'PAYOUT_STATEMENT']).optional(),
  status: z.enum(['ISSUED', 'PAID', 'VOID']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ===========================================================================
// Company — purchase invoices
// ===========================================================================
@ApiTags('invoicing')
@Controller('billing/invoices')
@UseGuards(JwtAuthGuard)
export class CompanyInvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema)) q: InvoiceListQuery,
  ) {
    return this.invoices.listForCompanyOwner(user.id, q);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.getForActor(user.id, id, 'company');
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const inv = await this.invoices.getForActor(user.id, id, 'company');
    const stream = await this.invoices.renderPdf(inv);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="trainova-${inv.number}.pdf"`,
    );
    stream.pipe(res);
  }
}

// ===========================================================================
// Trainer — payout statements (+ purchase invoices they are the issuer of)
// ===========================================================================
@ApiTags('invoicing')
@Controller('trainer-payments/statements')
@UseGuards(JwtAuthGuard)
export class TrainerStatementsController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema)) q: InvoiceListQuery,
  ) {
    return this.invoices.listForTrainer(user.id, q);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.getForActor(user.id, id, 'trainer');
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const inv = await this.invoices.getForActor(user.id, id, 'trainer');
    const stream = await this.invoices.renderPdf(inv);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="trainova-${inv.number}.pdf"`,
    );
    stream.pipe(res);
  }
}

// ===========================================================================
// Me — tax profile self-service
// ===========================================================================
@ApiTags('invoicing')
@Controller('me/tax-profile')
@UseGuards(JwtAuthGuard)
export class MeTaxProfileController {
  constructor(private readonly profiles: TaxProfileService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser): Promise<{
    profile: PublicTaxProfile | null;
  }> {
    const profile = await this.profiles.get(user.id);
    return { profile };
  }

  @Put()
  async upsert(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(taxProfileInputSchema))
    body: z.infer<typeof taxProfileInputSchema>,
  ) {
    return this.profiles.upsert(user.id, body);
  }
}

// ===========================================================================
// Admin — tax rule catalog + tax-id verification
// ===========================================================================
@ApiTags('invoicing')
@Controller('admin/tax-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.FINANCE)
export class AdminTaxRulesController {
  constructor(
    private readonly tax: TaxService,
    private readonly profiles: TaxProfileService,
  ) {}

  @Get()
  async list() {
    return this.tax.listRules();
  }

  @Post()
  async upsert(
    @Body(new ZodValidationPipe(taxRuleInputSchema))
    body: z.infer<typeof taxRuleInputSchema>,
  ) {
    return this.tax.upsertRule(body);
  }

  @Put(':countryCode')
  async update(
    @Param('countryCode') countryCode: string,
    @Body(new ZodValidationPipe(taxRuleInputSchema.omit({ countryCode: true }).extend({
      countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
    })))
    body: Partial<z.infer<typeof taxRuleInputSchema>>,
  ) {
    return this.tax.upsertRule({
      ...body,
      countryCode: countryCode.toUpperCase(),
    } as z.infer<typeof taxRuleInputSchema>);
  }

  @Delete(':countryCode')
  async remove(@Param('countryCode') countryCode: string) {
    await this.tax.deleteRule(countryCode);
    return { ok: true };
  }

  @Put('profiles/:userId/verify')
  async verify(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(z.object({ verified: z.boolean() })))
    body: { verified: boolean },
  ) {
    return this.profiles.adminVerify(userId, body.verified);
  }
}
