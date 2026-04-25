import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { randomSuffix, slugify } from '../common/slug.util';
import type { CreateJobRequestInput, UpdateJobRequestInput } from '@trainova/shared';

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
        // T7.G — sponsoredUntil first, then admin-curated `featured`,
        // then publishedAt for the stable default sort. `nulls: 'last'`
        // keeps unsponsored rows below current sponsors.
        orderBy: [
          { sponsoredUntil: { sort: 'desc', nulls: 'last' } },
          { featured: 'desc' },
          { publishedAt: 'desc' },
        ],
        take: Math.min(params.limit ?? 20, 50),
        skip: params.offset ?? 0,
      }),
      this.prisma.jobRequest.count({ where }),
    ]);
    const now = new Date();
    const decorated = items.map((row) => ({
      ...row,
      // Boolean flag the public list UI uses to render the green
      // "Sponsored" badge. The mirror column can drift after expiry; we
      // re-check `> now()` here so a stale value never causes a false
      // badge in the response.
      sponsored: row.sponsoredUntil != null && row.sponsoredUntil > now,
    }));
    return { items: decorated, total };
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

    if (input.modelConnectionId) {
      await this.assertOwnedConnection(company.id, input.modelConnectionId);
    }

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
        modelConnectionId: input.modelConnectionId ?? null,
        skills: skillRows.length ? { create: skillRows.map((s) => ({ skillId: s.id })) } : undefined,
      },
      include: { skills: { include: { skill: true } } },
    });
  }

  async update(ownerId: string, id: string, patch: UpdateJobRequestInput) {
    const request = await this.prisma.jobRequest.findUnique({
      where: { id },
      include: { company: { select: { id: true, ownerId: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.company.ownerId !== ownerId) throw new ForbiddenException('Not your request');

    const data: Record<string, unknown> = {};
    if (patch.modelConnectionId !== undefined) {
      if (patch.modelConnectionId === null) {
        data.modelConnectionId = null;
      } else {
        await this.assertOwnedConnection(request.company.id, patch.modelConnectionId);
        data.modelConnectionId = patch.modelConnectionId;
      }
    }

    return this.prisma.jobRequest.update({
      where: { id },
      data,
      include: { skills: { include: { skill: true } } },
    });
  }

  private async assertOwnedConnection(companyId: string, connectionId: string) {
    const conn = await this.prisma.modelConnection.findUnique({
      where: { id: connectionId },
      select: { companyId: true, deletedAt: true },
    });
    if (!conn || conn.deletedAt) {
      throw new NotFoundException('model connection not found');
    }
    if (conn.companyId !== companyId) {
      throw new BadRequestException('model connection belongs to a different company');
    }
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
