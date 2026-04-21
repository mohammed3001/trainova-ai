import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [users, companies, trainers, requestsOpen, applications, disputes] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.company.count(),
      this.prisma.trainerProfile.count(),
      this.prisma.jobRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.application.count(),
      this.prisma.notification.count({ where: { type: 'DISPUTE' } }),
    ]);
    return {
      users,
      companies,
      trainers,
      requestsOpen,
      applications,
      disputes,
      generatedAt: new Date().toISOString(),
    };
  }

  listUsers(limit = 50) {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
  }

  listCompanies() {
    return this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, country: true, verified: true, createdAt: true },
    });
  }

  listRequests() {
    return this.prisma.jobRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { company: { select: { name: true, slug: true } }, _count: { select: { applications: true } } },
    });
  }

  listSkills() {
    return this.prisma.skill.findMany({ orderBy: { nameEn: 'asc' } });
  }
}
