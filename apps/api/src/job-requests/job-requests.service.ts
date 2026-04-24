import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { randomSuffix, slugify } from '../common/slug.util';
import type { CreateJobRequestInput } from '@trainova/shared';

@Injectable()
export class JobRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(params: {
    q?: string;
    skill?: string;
    industry?: string;
    modelFamily?: string;
    limit?: number;
    offset?: number;
  }) {
    const where = {
      status: 'OPEN' as const,
      ...(params.q
        ? { OR: [{ title: { contains: params.q, mode: 'insensitive' as const } }, { description: { contains: params.q, mode: 'insensitive' as const } }] }
        : {}),
      ...(params.industry ? { industry: { equals: params.industry, mode: 'insensitive' as const } } : {}),
      ...(params.modelFamily ? { modelFamily: { equals: params.modelFamily, mode: 'insensitive' as const } } : {}),
      ...(params.skill ? { skills: { some: { skill: { slug: params.skill } } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.jobRequest.findMany({
        where,
        include: {
          company: { select: { id: true, slug: true, name: true, logoUrl: true, country: true, verified: true } },
          skills: { include: { skill: true }, take: 8 },
        },
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
        take: Math.min(params.limit ?? 20, 50),
        skip: params.offset ?? 0,
      }),
      this.prisma.jobRequest.count({ where }),
    ]);
    return { items, total };
  }

  async findBySlug(slug: string) {
    const request = await this.prisma.jobRequest.findUnique({
      where: { slug },
      include: {
        company: { select: { id: true, slug: true, name: true, logoUrl: true, country: true, industry: true, verified: true, description: true } },
        skills: { include: { skill: true } },
        questions: { orderBy: { order: 'asc' } },
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  async listMine(ownerId: string) {
    const company = await this.prisma.company.findUnique({ where: { ownerId } });
    if (!company) throw new NotFoundException('Company not found');
    return this.prisma.jobRequest.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      include: {
        skills: { include: { skill: true } },
        _count: { select: { applications: true } },
      },
    });
  }

  async create(ownerId: string, input: CreateJobRequestInput) {
    const company = await this.prisma.company.findUnique({ where: { ownerId } });
    if (!company) throw new ForbiddenException('No company');

    const slug = await this.uniqueSlug(input.title);
    const skillRows = input.skills?.length
      ? await this.prisma.skill.findMany({ where: { slug: { in: input.skills } }, select: { id: true } })
      : [];

    return this.prisma.jobRequest.create({
      data: {
        companyId: company.id,
        slug,
        title: input.title,
        description: input.description,
        objective: input.objective ?? null,
        modelFamily: input.modelFamily ?? null,
        industry: input.industry ?? null,
        languages: input.languages ?? [],
        durationDays: input.durationDays ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        currency: input.currency,
        workType: input.workType,
        confidentialityLevel: input.confidentialityLevel,
        status: 'OPEN',
        publishedAt: new Date(),
        applicationSchema: input.applicationSchema
          ? (input.applicationSchema as Prisma.InputJsonValue)
          : Prisma.DbNull,
        skills: skillRows.length ? { create: skillRows.map((s) => ({ skillId: s.id })) } : undefined,
      },
      include: { skills: { include: { skill: true } } },
    });
  }

  async applications(ownerId: string, requestId: string) {
    const request = await this.prisma.jobRequest.findUnique({
      where: { id: requestId },
      include: { company: { select: { ownerId: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.company.ownerId !== ownerId) throw new ForbiddenException('Not your request');

    return this.prisma.application.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
      include: {
        trainer: {
          select: {
            id: true,
            name: true,
            email: true,
            trainerProfile: {
              select: {
                slug: true,
                headline: true,
                country: true,
                verified: true,
                hourlyRateMin: true,
                hourlyRateMax: true,
              },
            },
          },
        },
        request: { select: { applicationSchema: true } },
      },
    });
  }

  private async uniqueSlug(title: string) {
    const base = slugify(title);
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const hit = await this.prisma.jobRequest.findUnique({ where: { slug } });
      if (!hit) return slug;
      slug = `${base}-${randomSuffix(4)}`;
    }
    return `${base}-${Date.now()}`;
  }
}
