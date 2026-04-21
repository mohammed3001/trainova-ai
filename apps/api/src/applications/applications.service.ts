import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ApplyToRequestInput } from '@trainova/shared';
import type { ApplicationStatus } from '@trainova/db';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(trainerId: string) {
    return this.prisma.application.findMany({
      where: { trainerId },
      orderBy: { createdAt: 'desc' },
      include: {
        request: {
          select: {
            id: true,
            slug: true,
            title: true,
            modelFamily: true,
            industry: true,
            status: true,
            company: { select: { name: true, slug: true, logoUrl: true, verified: true } },
          },
        },
      },
    });
  }

  async apply(trainerId: string, input: ApplyToRequestInput) {
    const request = await this.prisma.jobRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'OPEN') throw new BadRequestException('Request is not open');

    const existing = await this.prisma.application.findUnique({
      where: { requestId_trainerId: { requestId: input.requestId, trainerId } },
    });
    if (existing) throw new ConflictException('Already applied');

    return this.prisma.application.create({
      data: {
        requestId: input.requestId,
        trainerId,
        coverLetter: input.coverLetter,
        proposedRate: input.proposedRate,
        proposedTimelineDays: input.proposedTimelineDays,
      },
    });
  }

  async updateStatus(ownerId: string, applicationId: string, status: ApplicationStatus) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.request.company.ownerId !== ownerId) throw new ForbiddenException('Not your application');
    return this.prisma.application.update({ where: { id: applicationId }, data: { status } });
  }
}
