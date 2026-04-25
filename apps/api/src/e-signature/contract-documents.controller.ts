import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  declineContractDocumentInputSchema,
  generateContractDocumentInputSchema,
  signContractDocumentInputSchema,
  type DeclineContractDocumentInput,
  type GenerateContractDocumentParsed,
  type SignContractDocumentInput,
} from '@trainova/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { clientIp } from '../common/client-ip.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContractDocumentsService } from './contract-documents.service';

const listQuerySchema = z.object({
  contractId: z.string().min(1).max(64),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contract-documents')
export class ContractDocumentsController {
  constructor(private readonly service: ContractDocumentsService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(listQuerySchema))
  list(@CurrentUser() user: AuthUser, @Query() query: ListQuery) {
    return this.service.listForContract(user.id, query.contractId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(generateContractDocumentInputSchema))
  generate(
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateContractDocumentParsed,
  ) {
    return this.service.generate(user.id, body);
  }

  @Post(':id/sign')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(signContractDocumentInputSchema))
  sign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SignContractDocumentInput,
    @Req() req: Request,
  ) {
    return this.service.sign(user.id, id, body, {
      ip: clientIp(req) ?? undefined,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }

  @Post(':id/decline')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(declineContractDocumentInputSchema))
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: DeclineContractDocumentInput,
  ) {
    return this.service.decline(user.id, id, body);
  }
}
