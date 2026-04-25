import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateContractTemplateParsed,
  type ListTemplatesQuery,
  type UpdateContractTemplateInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class ContractTemplatesService {
  private readonly logger = new Logger(ContractTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTemplatesQuery = {}) {
    return this.prisma.contractTemplate.findMany({
      where: {
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.locale ? { locale: query.locale.toUpperCase() } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listPublished(query: { kind?: ListTemplatesQuery['kind']; locale?: string } = {}) {
    return this.prisma.contractTemplate.findMany({
      where: {
        status: 'PUBLISHED',
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.locale ? { locale: query.locale.toUpperCase() } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const template = await this.prisma.contractTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async create(actorId: string, input: CreateContractTemplateParsed) {
    try {
      const created = await this.prisma.contractTemplate.create({
        data: {
          kind: input.kind,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          bodyMarkdown: input.bodyMarkdown,
          locale: input.locale,
          variables: input.variables,
          status: input.status,
          createdById: actorId,
        },
      });
      this.logger.log(
        `Template created id=${created.id} kind=${created.kind} slug=${created.slug} actor=${actorId}`,
      );
      return created;
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException('Template slug already in use');
      }
      throw err;
    }
  }

  async update(id: string, actorId: string, input: UpdateContractTemplateInput) {
    const existing = await this.prisma.contractTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Template not found');
    try {
      const updated = await this.prisma.contractTemplate.update({
        where: { id },
        data: {
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description ?? null }
            : {}),
          ...(input.bodyMarkdown !== undefined ? { bodyMarkdown: input.bodyMarkdown } : {}),
          ...(input.locale !== undefined
            ? { locale: input.locale.toString().toUpperCase() }
            : {}),
          ...(input.variables !== undefined ? { variables: input.variables } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      this.logger.log(`Template updated id=${updated.id} actor=${actorId}`);
      return updated;
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException('Template slug already in use');
      }
      throw err;
    }
  }

  async archive(id: string, actorId: string) {
    const existing = await this.prisma.contractTemplate.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!existing) throw new NotFoundException('Template not found');
    if (existing.status === 'ARCHIVED') {
      throw new BadRequestException('Template already archived');
    }
    const updated = await this.prisma.contractTemplate.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    this.logger.log(`Template archived id=${updated.id} actor=${actorId}`);
    return updated;
  }
}
