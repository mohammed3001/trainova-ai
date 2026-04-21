import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
}
