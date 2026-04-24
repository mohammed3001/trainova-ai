import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EmailTemplate, Prisma } from '@trainova/db';
import {
  EMAIL_TEMPLATE_SPECS,
  type CreateEmailTemplateInput,
  type EmailTemplateKey,
  type EmailTemplateLocale,
  type ListEmailTemplatesQuery,
  type PreviewEmailTemplateInput,
  type UpdateEmailTemplateInput,
  interpolateEmailTemplate,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface EmailTemplatePreview {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  unresolvedVariables: string[];
}

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEmailTemplatesQuery): Promise<EmailTemplate[]> {
    const where: Prisma.EmailTemplateWhereInput = {};
    if (query.key) where.key = query.key;
    if (query.locale) where.locale = query.locale;
    if (query.enabled !== undefined) where.enabled = query.enabled;
    if (query.q) {
      where.OR = [
        { subject: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.emailTemplate.findMany({
      where,
      orderBy: [{ key: 'asc' }, { locale: 'asc' }],
      include: {
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getById(id: string): Promise<EmailTemplate> {
    const row = await this.prisma.emailTemplate.findUnique({
      where: { id },
      include: {
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('Email template not found');
    return row;
  }

  async getByKeyLocale(
    key: EmailTemplateKey,
    locale: EmailTemplateLocale,
  ): Promise<EmailTemplate | null> {
    return this.prisma.emailTemplate.findUnique({
      where: { key_locale: { key, locale } },
    });
  }

  async create(input: CreateEmailTemplateInput, actorId: string): Promise<EmailTemplate> {
    this.assertKeyExists(input.key);
    const existing = await this.prisma.emailTemplate.findUnique({
      where: { key_locale: { key: input.key, locale: input.locale } },
    });
    if (existing) {
      throw new BadRequestException('Template already exists for this key + locale');
    }
    const spec = EMAIL_TEMPLATE_SPECS[input.key];
    return this.prisma.emailTemplate.create({
      data: {
        key: input.key,
        locale: input.locale,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
        enabled: input.enabled ?? true,
        description: input.description ?? spec.description,
        variables: [...spec.requiredVariables, ...spec.optionalVariables],
        updatedById: actorId,
      },
    });
  }

  async update(
    id: string,
    input: UpdateEmailTemplateInput,
    actorId: string,
  ): Promise<EmailTemplate> {
    const existing = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Email template not found');
    return this.prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(input.subject !== undefined && { subject: input.subject }),
        ...(input.bodyHtml !== undefined && { bodyHtml: input.bodyHtml }),
        ...(input.bodyText !== undefined && { bodyText: input.bodyText }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.description !== undefined && { description: input.description }),
        updatedById: actorId,
      },
    });
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Email template not found');
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { id };
  }

  /**
   * Renders a template against sample or real variables without sending.
   * `unresolvedVariables` tells the admin which `{{foo}}` tokens were left
   * untouched (either misnamed or no sample provided) so they can fix the
   * template before saving.
   */
  preview(input: PreviewEmailTemplateInput): EmailTemplatePreview {
    const vars = input.variables ?? {};
    const subject = interpolateEmailTemplate(input.subject, vars, { escapeHtml: false });
    const bodyHtml = interpolateEmailTemplate(input.bodyHtml, vars, { escapeHtml: true });
    const bodyText = interpolateEmailTemplate(input.bodyText, vars, { escapeHtml: false });
    const pattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    const unresolved = new Set<string>();
    for (const source of [subject, bodyHtml, bodyText]) {
      for (const match of source.matchAll(pattern)) {
        unresolved.add(match[1]!);
      }
    }
    return { subject, bodyHtml, bodyText, unresolvedVariables: [...unresolved].sort() };
  }

  private assertKeyExists(key: string): asserts key is EmailTemplateKey {
    if (!(key in EMAIL_TEMPLATE_SPECS)) {
      throw new BadRequestException('Unknown template key');
    }
  }
}
