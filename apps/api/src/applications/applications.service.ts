import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import {
  APPLICATION_STATUS_TRANSITIONS,
  AUDIT_ACTIONS,
  canTransitionApplicationStatus,
  type ApplyToRequestInput,
} from '@trainova/shared';
import type { ApplicationStatus } from '@trainova/db';

interface StatusUpdateContext {
  ip?: string | null;
  userAgent?: string | null;
  locale?: string | null;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
  ) {}

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

  async updateStatus(
    ownerId: string,
    applicationId: string,
    status: ApplicationStatus,
    note: string | undefined,
    ctx: StatusUpdateContext = {},
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your application');
    }

    const fromStatus = app.status;
    const toStatus = status;

    if (!canTransitionApplicationStatus(fromStatus, toStatus)) {
      const allowed = APPLICATION_STATUS_TRANSITIONS[fromStatus];
      throw new BadRequestException(
        allowed.length === 0
          ? `Application is in terminal state ${fromStatus}`
          : `Invalid transition ${fromStatus} → ${toStatus}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic claim: only proceed if the row is still at `fromStatus`.
      // Prevents lost updates when two concurrent PATCHes race.
      const claim = await tx.application.updateMany({
        where: { id: applicationId, status: fromStatus },
        data: { status: toStatus },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Application status changed concurrently, please reload');
      }

      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
          entityType: 'Application',
          entityId: applicationId,
          ip: ctx.ip ?? null,
          diff: {
            fromStatus,
            toStatus,
            note: note ?? null,
            userAgent: ctx.userAgent ?? null,
            locale: ctx.locale ?? null,
          },
        },
      });

      return tx.application.findUniqueOrThrow({ where: { id: applicationId } });
    });
  }

  async assignTest(
    ownerId: string,
    applicationId: string,
    testId: string,
    ctx: StatusUpdateContext = {},
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your application');
    }

    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: {
        id: true,
        requestId: true,
        tasks: { select: { id: true } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    if (test.requestId !== app.requestId) {
      throw new BadRequestException('Test does not belong to this application request');
    }
    if (test.tasks.length === 0) {
      throw new BadRequestException('Test has no tasks — add tasks before assigning');
    }

    const fromStatus = app.status;
    const toStatus: ApplicationStatus = 'TEST_ASSIGNED';
    if (!canTransitionApplicationStatus(fromStatus, toStatus)) {
      throw new BadRequestException(
        `Cannot assign a test from status ${fromStatus} — application must be APPLIED or SHORTLISTED`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.application.updateMany({
        where: { id: applicationId, status: fromStatus },
        data: { status: toStatus },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Application status changed concurrently, please reload');
      }

      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
          entityType: 'Application',
          entityId: applicationId,
          ip: ctx.ip ?? null,
          diff: {
            fromStatus,
            toStatus,
            testId,
            userAgent: ctx.userAgent ?? null,
            locale: ctx.locale ?? null,
          },
        },
      });
    });

    // Send the email outside the transaction so a provider hiccup doesn't
    // roll back the status change. Failures are logged but not fatal.
    try {
      await this.tests.sendAssignmentEmail(applicationId, testId);
    } catch {
      /* swallow — status change is authoritative */
    }

    return this.prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  }

  async history(userId: string, applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: { select: { ownerId: true } } } } },
    });
    if (!app) throw new NotFoundException('Application not found');

    const isOwner = app.request.company.ownerId === userId;
    const isTrainer = app.trainerId === userId;
    if (!isOwner && !isTrainer) {
      throw new ForbiddenException('Not allowed to view this history');
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'Application',
        entityId: applicationId,
        action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
      },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true } } },
    });

    return rows.map((row) => {
      const diff = (row.diff ?? {}) as {
        fromStatus?: string;
        toStatus?: string;
        note?: string | null;
        locale?: string | null;
      };
      return {
        id: row.id,
        action: row.action,
        fromStatus: diff.fromStatus ?? null,
        toStatus: diff.toStatus ?? null,
        note: diff.note ?? null,
        locale: diff.locale ?? null,
        actorId: row.actorId,
        actorName: row.actor?.name ?? null,
        createdAt: row.createdAt,
      };
    });
  }
}
