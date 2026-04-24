import {
  BadRequestException,
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
  CreateEmailTemplateSchema,
  EMAIL_TEMPLATE_SPECS,
  ListEmailTemplatesQuerySchema,
  PreviewEmailTemplateSchema,
  UpdateEmailTemplateSchema,
  type CreateEmailTemplateInput,
  type PreviewEmailTemplateInput,
  type UpdateEmailTemplateInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EmailTemplatesService } from './email-templates.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('admin/email-templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get('specs')
  specs() {
    return { specs: Object.values(EMAIL_TEMPLATE_SPECS) };
  }

  @Get()
  list(@Query() query: Record<string, string>) {
    const parsed = ListEmailTemplatesQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid query',
        issues: parsed.error.flatten(),
      });
    }
    return this.service.list(parsed.data);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateEmailTemplateSchema))
    body: CreateEmailTemplateInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEmailTemplateSchema))
    body: UpdateEmailTemplateInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, body, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('preview')
  preview(
    @Body(new ZodValidationPipe(PreviewEmailTemplateSchema))
    body: PreviewEmailTemplateInput,
  ) {
    return this.service.preview(body);
  }
}
