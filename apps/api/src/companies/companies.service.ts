import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateCompanyInput } from '@trainova/shared';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const company = await this.prisma.company.findUnique({ where: { ownerId: userId } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async updateMe(userId: string, data: UpdateCompanyInput) {
    const company = await this.prisma.company.findUnique({ where: { ownerId: userId } });
    if (!company) throw new NotFoundException('Company not found');
    // The Zod schema accepts '' for URL fields as an explicit clear signal.
    // Coerce '' to null so the column ends up nullable instead of stuck with a
    // blank string.
    const URL_KEYS = ['websiteUrl', 'logoUrl'] as const;
    const patch: Record<string, unknown> = { ...data };
    for (const k of URL_KEYS) {
      if (patch[k] === '') patch[k] = null;
    }
    return this.prisma.company.update({ where: { id: company.id }, data: patch });
  }

  async findBySlug(slug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug },
      include: {
        requests: {
          where: { status: 'OPEN' },
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            modelFamily: true,
            industry: true,
            publishedAt: true,
          },
          orderBy: { publishedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  ensureOwner(userId: string, companyId: string, companyOwnerId: string) {
    if (companyOwnerId !== userId) throw new ForbiddenException('Not the owner of this company');
    return companyId;
  }
}
