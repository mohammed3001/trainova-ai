import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats() {
    const [companies, trainers, openRequests] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.trainerProfile.count(),
      this.prisma.jobRequest.count({ where: { status: 'OPEN' } }),
    ]);
    return { companies, trainers, openRequests };
  }

  @Get('plans')
  plans() {
    return this.prisma.plan.findMany({ orderBy: [{ audience: 'asc' }, { priceMonthly: 'asc' }] });
  }

  @Get('sitemap-entries')
  @ApiOperation({
    summary: 'Flat list of every public URL slug + last-modified time',
    description:
      'Consumed by Next.js `sitemap.ts` to emit `/sitemap.xml`. Returns only what the public website exposes: verified trainer profiles are prioritised, all listed companies, all OPEN job requests, all skills. Limits are generous but bounded so the endpoint stays cheap.',
  })
  async sitemapEntries() {
    const [trainers, companies, requests, skills] = await Promise.all([
      this.prisma.trainerProfile.findMany({
        select: { slug: true, updatedAt: true, verified: true },
        orderBy: [{ verified: 'desc' }, { updatedAt: 'desc' }],
        take: 5000,
      }),
      this.prisma.company.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5000,
      }),
      this.prisma.jobRequest.findMany({
        where: { status: 'OPEN' },
        select: { slug: true, updatedAt: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: 5000,
      }),
      this.prisma.skill.findMany({
        select: { slug: true, createdAt: true },
        orderBy: { slug: 'asc' },
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      trainers: trainers.map((t) => ({
        slug: t.slug,
        updatedAt: t.updatedAt.toISOString(),
        verified: t.verified,
      })),
      companies: companies.map((c) => ({
        slug: c.slug,
        updatedAt: c.updatedAt.toISOString(),
      })),
      requests: requests.map((r) => ({
        slug: r.slug,
        updatedAt: r.updatedAt.toISOString(),
        publishedAt: r.publishedAt?.toISOString() ?? null,
      })),
      skills: skills.map((s) => ({
        slug: s.slug,
        updatedAt: s.createdAt.toISOString(),
      })),
    };
  }
}
