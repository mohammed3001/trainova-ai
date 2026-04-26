import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ApiTokenGuard,
  RequireApiTokenScope,
} from '../api-tokens/api-token.guard';

const listJobRequestsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
type ListJobRequestsQuery = z.infer<typeof listJobRequestsQuerySchema>;

const createJobRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  industry: z.string().trim().max(80).optional(),
  modelFamily: z.string().trim().max(80).optional(),
  budgetMin: z.number().int().min(0).optional(),
  budgetMax: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  /** When omitted, the request stays in DRAFT until promoted via the dashboard. */
  publish: z.boolean().optional(),
});
type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>;

const listApplicationsQuerySchema = z.object({
  status: z
    .enum([
      'APPLIED',
      'SHORTLISTED',
      'TEST_ASSIGNED',
      'TEST_SUBMITTED',
      'INTERVIEW',
      'OFFERED',
      'ACCEPTED',
      'REJECTED',
      'WITHDRAWN',
    ])
    .optional(),
  requestId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;

const listTrainersQuerySchema = z.object({
  skill: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
type ListTrainersQuery = z.infer<typeof listTrainersQuerySchema>;

const listContractsQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISPUTED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

/**
 * T9.B — Public API for Enterprise (`/v1/*`).
 *
 * Token-authenticated REST surface for programmatic access to the
 * caller's own company data. Every endpoint declares its required
 * scope via `@RequireApiTokenScope`, which the guard enforces against
 * the resolved token's `scopes` column.
 *
 * Responses are intentionally lean and stable — they don't echo
 * internal-only fields (audit metadata, raw scoring inputs, etc.) so
 * we can evolve those without breaking integrators.
 */
@ApiTags('public-api')
@Controller({ path: 'v1', version: undefined })
@UseGuards(ApiTokenGuard)
export class PublicApiController {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Job requests
  // ---------------------------------------------------------------------------

  @Get('job-requests')
  @RequireApiTokenScope('read:job-requests')
  async listJobRequests(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listJobRequestsQuerySchema)) query: ListJobRequestsQuery,
  ) {
    const ctx = req.apiToken!;
    const where: Prisma.JobRequestWhereInput = {
      companyId: ctx.companyId,
      ...(query.status ? { status: query.status as Prisma.JobRequestWhereInput['status'] } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.jobRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          status: true,
          industry: true,
          modelFamily: true,
          budgetMin: true,
          budgetMax: true,
          currency: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.jobRequest.count({ where }),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  @Get('job-requests/:id')
  @RequireApiTokenScope('read:job-requests')
  async getJobRequest(@Req() req: Request, @Param('id') id: string) {
    const ctx = req.apiToken!;
    const row = await this.prisma.jobRequest.findFirst({
      where: { id, companyId: ctx.companyId },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        status: true,
        industry: true,
        modelFamily: true,
        budgetMin: true,
        budgetMax: true,
        currency: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        skills: {
          select: { skill: { select: { slug: true, nameEn: true, nameAr: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Job request not found');
    return row;
  }

  @Post('job-requests')
  @RequireApiTokenScope('write:job-requests')
  async createJobRequest(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createJobRequestSchema)) body: CreateJobRequestInput,
  ) {
    const ctx = req.apiToken!;
    // Slug = lowercased title with random suffix; mirrors the
    // dashboard creator. We avoid sharing helpers across modules to
    // keep the public surface cheap to refactor.
    const baseSlug = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const suffix = Math.random().toString(36).slice(2, 8);
    const slug = `${baseSlug || 'request'}-${suffix}`;
    const now = new Date();
    const created = await this.prisma.jobRequest.create({
      data: {
        companyId: ctx.companyId,
        slug,
        title: body.title,
        description: body.description,
        industry: body.industry,
        modelFamily: body.modelFamily,
        budgetMin: body.budgetMin,
        budgetMax: body.budgetMax,
        currency: body.currency,
        status: body.publish ? 'OPEN' : 'DRAFT',
        publishedAt: body.publish ? now : null,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        publishedAt: true,
        createdAt: true,
      },
    });
    return created;
  }

  // ---------------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------------

  @Get('applications')
  @RequireApiTokenScope('read:applications')
  async listApplications(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listApplicationsQuerySchema)) query: ListApplicationsQuery,
  ) {
    const ctx = req.apiToken!;
    const where: Prisma.ApplicationWhereInput = {
      request: { companyId: ctx.companyId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.requestId ? { requestId: query.requestId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          request: { select: { id: true, slug: true, title: true } },
          trainer: {
            select: {
              id: true,
              name: true,
              trainerProfile: { select: { country: true } },
            },
          },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  // ---------------------------------------------------------------------------
  // Trainers (search by skills attached to the caller's open requests)
  // ---------------------------------------------------------------------------

  @Get('trainers')
  @RequireApiTokenScope('read:trainers')
  async listTrainers(
    @Query(new ZodValidationPipe(listTrainersQuerySchema)) query: ListTrainersQuery,
  ) {
    const where: Prisma.UserWhereInput = {
      role: 'TRAINER',
      status: 'ACTIVE',
      ...(query.country || query.skill
        ? {
            trainerProfile: {
              ...(query.country
                ? { country: { equals: query.country, mode: 'insensitive' as const } }
                : {}),
              ...(query.skill
                ? { skills: { some: { skill: { slug: query.skill } } } }
                : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          name: true,
          trainerProfile: {
            select: {
              country: true,
              headline: true,
              hourlyRateMin: true,
              hourlyRateMax: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  // ---------------------------------------------------------------------------
  // Contracts
  // ---------------------------------------------------------------------------

  @Get('contracts')
  @RequireApiTokenScope('read:contracts')
  async listContracts(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listContractsQuerySchema)) query: ListContractsQuery,
  ) {
    const ctx = req.apiToken!;
    const where: Prisma.ContractWhereInput = {
      companyId: ctx.companyId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          status: true,
          title: true,
          totalAmountCents: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          trainer: { select: { id: true, name: true } },
          application: {
            select: { request: { select: { id: true, slug: true, title: true } } },
          },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }
}
