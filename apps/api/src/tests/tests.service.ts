import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AUDIT_ACTIONS,
  type CreateTestInput,
  type GradeAttemptInput,
  type SubmitAttemptInput,
  type TestTaskInput,
  type UpdateTestInput,
} from '@trainova/shared';

interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  locale?: string | null;
}

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // =========================================================================
  // Company — authoring
  // =========================================================================

  async listForRequest(ownerId: string, requestId: string) {
    await this.assertRequestOwner(ownerId, requestId);
    return this.prisma.test.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        timeLimitMin: true,
        passingScore: true,
        scoringMode: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { tasks: true, attempts: true } },
      },
    });
  }

  async create(ownerId: string, input: CreateTestInput) {
    await this.assertRequestOwner(ownerId, input.requestId);
    return this.prisma.test.create({
      data: {
        requestId: input.requestId,
        title: input.title,
        description: input.description ?? null,
        timeLimitMin: input.timeLimitMin ?? null,
        passingScore: input.passingScore ?? 60,
        scoringMode: input.scoringMode ?? 'HYBRID',
        tasks: {
          create: input.tasks.map((task, index) => this.taskCreateData(task, index)),
        },
      },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });
  }

  async update(ownerId: string, testId: string, input: UpdateTestInput) {
    const test = await this.loadOwnedTest(ownerId, testId);

    return this.prisma.$transaction(async (tx) => {
      await tx.test.update({
        where: { id: test.id },
        data: {
          title: input.title ?? undefined,
          description: input.description ?? undefined,
          timeLimitMin: input.timeLimitMin === undefined ? undefined : input.timeLimitMin,
          passingScore: input.passingScore ?? undefined,
          scoringMode: input.scoringMode ?? undefined,
        },
      });

      if (input.tasks) {
        const existingTasks = await tx.testTask.findMany({
          where: { testId: test.id },
          select: { id: true },
        });
        const existingIds = new Set(existingTasks.map((t) => t.id));
        const keptIds = new Set(
          input.tasks.map((t) => t.id).filter((id): id is string => Boolean(id)),
        );
        const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

        if (toDelete.length > 0) {
          const withResponses = await tx.testTaskResponse.findMany({
            where: { taskId: { in: toDelete } },
            select: { taskId: true },
            distinct: ['taskId'],
          });
          if (withResponses.length > 0) {
            throw new ConflictException({
              message: 'Cannot delete tasks that already have trainer responses',
              code: 'TEST_TASK_HAS_RESPONSES',
              taskIds: withResponses.map((r) => r.taskId),
            });
          }
          await tx.testTask.deleteMany({ where: { id: { in: toDelete } } });
        }

        for (let i = 0; i < input.tasks.length; i++) {
          const task = input.tasks[i];
          if (!task) continue;
          if (task.id && existingIds.has(task.id)) {
            await tx.testTask.update({
              where: { id: task.id },
              data: this.taskUpdateData(task, i),
            });
          } else {
            await tx.testTask.create({
              data: { testId: test.id, ...this.taskCreateData(task, i) },
            });
          }
        }
      }

      return tx.test.findUniqueOrThrow({
        where: { id: test.id },
        include: { tasks: { orderBy: { order: 'asc' } } },
      });
    });
  }

  // Editor-facing fetch: returns full task data including answerKey + rubric,
  // restricted to the company owner (or admin). The public `findOneForUser`
  // deliberately strips those fields so neither the trainer nor any non-owner
  // company role ever sees the answers — this endpoint is only for authoring.
  async findOneForEditor(userId: string, userRole: string, testId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: {
        request: { include: { company: { select: { ownerId: true, name: true } } } },
        tasks: { orderBy: { order: 'asc' } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    const isOwner = test.request?.company.ownerId === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Not allowed to edit this test');
    }
    return test;
  }

  async remove(ownerId: string, testId: string) {
    const test = await this.loadOwnedTest(ownerId, testId);
    const attempts = await this.prisma.testAttempt.count({ where: { testId: test.id } });
    if (attempts > 0) {
      throw new ConflictException({
        message: 'Cannot delete a test that already has attempts',
        code: 'TEST_HAS_ATTEMPTS',
      });
    }
    await this.prisma.test.delete({ where: { id: test.id } });
    return { ok: true };
  }

  // =========================================================================
  // Shared — fetch a test (with ownership checks)
  // =========================================================================

  async findOneForUser(userId: string, userRole: string, testId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: {
        request: { include: { company: { select: { ownerId: true, name: true } } } },
        tasks: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            prompt: true,
            type: true,
            options: true,
            maxScore: true,
            order: true,
            // answerKey + rubric intentionally excluded — never leaked to the client
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    // `tasks` select above intentionally omits answerKey/rubric so neither
    // company owner nor trainer ever sees the answers via this endpoint.
    const isOwner = test.request?.company.ownerId === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (isOwner || isAdmin) return test;

    if (userRole === 'TRAINER') {
      const hasAttempt = await this.prisma.testAttempt.findFirst({
        where: { testId: test.id, trainerId: userId },
        select: { id: true },
      });
      if (hasAttempt) return test;
    }
    throw new ForbiddenException('Not allowed to view this test');
  }

  // =========================================================================
  // Trainer — taking
  // =========================================================================

  async startAttempt(trainerId: string, testId: string, applicationId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: { id: true, requestId: true, tasks: { select: { id: true } } },
    });
    if (!test) throw new NotFoundException('Test not found');
    if (test.tasks.length === 0) {
      throw new BadRequestException('Test has no tasks');
    }

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, requestId: true, trainerId: true, status: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.trainerId !== trainerId) {
      throw new ForbiddenException('Not your application');
    }
    if (application.requestId !== test.requestId) {
      throw new BadRequestException('Test does not belong to this application request');
    }
    if (application.status !== 'TEST_ASSIGNED') {
      throw new BadRequestException(
        `Application must be in TEST_ASSIGNED to start (current: ${application.status})`,
      );
    }

    // Idempotent: re-use an existing attempt for this (test, trainer, application)
    // tuple. The @@unique index on TestAttempt(testId, trainerId, applicationId)
    // guarantees that concurrent requests can't create duplicates — the race
    // loser gets P2002 and we return the row the winner just created.
    const existing = await this.prisma.testAttempt.findUnique({
      where: {
        testId_trainerId_applicationId: { testId, trainerId, applicationId },
      },
    });
    if (existing) return existing;

    try {
      return await this.prisma.testAttempt.create({
        data: {
          testId,
          trainerId,
          applicationId,
          status: 'IN_PROGRESS',
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.testAttempt.findUniqueOrThrow({
          where: {
            testId_trainerId_applicationId: { testId, trainerId, applicationId },
          },
        });
      }
      throw err;
    }
  }

  async submitAttempt(
    trainerId: string,
    attemptId: string,
    body: SubmitAttemptInput,
    ctx: RequestContext = {},
  ) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: { test: { include: { tasks: true } } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.trainerId !== trainerId) throw new ForbiddenException('Not your attempt');
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Attempt already submitted');
    }

    let autoTotal = 0;
    let autoMaxTotal = 0;
    let maxTotal = 0;
    let hasManualTask = false;
    const responseRows: Array<{ taskId: string; response: object; autoScore: number | null }> = [];

    for (const task of attempt.test.tasks) {
      maxTotal += task.maxScore;
      const isAutoGradable = task.type === 'MCQ' && !!task.answerKey;
      if (isAutoGradable) autoMaxTotal += task.maxScore;
      else hasManualTask = true;

      const entry = body.responses.find((r) => r.taskId === task.id);
      if (!entry) continue;

      let autoScore: number | null = null;
      if (isAutoGradable) {
        autoScore = String(entry.response) === task.answerKey ? task.maxScore : 0;
        autoTotal += autoScore;
      }
      responseRows.push({
        taskId: task.id,
        response: this.normalizeResponseForStorage(entry.response),
        autoScore,
      });
    }

    const autoPercent = autoMaxTotal > 0 ? Math.round((autoTotal / autoMaxTotal) * 100) : 0;
    const totalScore = hasManualTask ? null : autoPercent;
    const submittedAt = new Date();
    const durationSec = Math.max(
      0,
      Math.floor((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
    );

    return this.prisma.$transaction(async (tx) => {
      // Persist responses (idempotent per @@unique([attemptId, taskId]))
      for (const row of responseRows) {
        await tx.testTaskResponse.upsert({
          where: { attemptId_taskId: { attemptId, taskId: row.taskId } },
          update: { response: row.response, autoScore: row.autoScore },
          create: {
            attemptId,
            taskId: row.taskId,
            response: row.response,
            autoScore: row.autoScore,
          },
        });
      }

      const updatedAttempt = await tx.testAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'SUBMITTED',
          submittedAt,
          durationSec,
          totalScore,
          scoreBreakdown: {
            autoTotal,
            autoMax: autoMaxTotal,
            autoPercent,
            manualTotal: 0,
            manualMax: maxTotal - autoMaxTotal,
            max: maxTotal,
            requiresManualGrading: hasManualTask,
          },
        },
        include: { responses: true },
      });

      // Link application status: TEST_ASSIGNED → TEST_SUBMITTED, atomic claim
      if (attempt.applicationId) {
        const claim = await tx.application.updateMany({
          where: { id: attempt.applicationId, status: 'TEST_ASSIGNED' },
          data: { status: 'TEST_SUBMITTED' },
        });
        if (claim.count > 0) {
          await tx.auditLog.create({
            data: {
              actorId: trainerId,
              action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
              entityType: 'Application',
              entityId: attempt.applicationId,
              ip: ctx.ip ?? null,
              diff: {
                fromStatus: 'TEST_ASSIGNED',
                toStatus: 'TEST_SUBMITTED',
                testAttemptId: attemptId,
                testId: attempt.testId,
                userAgent: ctx.userAgent ?? null,
                locale: ctx.locale ?? null,
              },
            },
          });
        }
      }

      return updatedAttempt;
    }).then(async (result) => {
      // Notify the company owner that a test was submitted and awaits review.
      if (attempt.applicationId) {
        const app = await this.prisma.application.findUnique({
          where: { id: attempt.applicationId },
          include: {
            trainer: { select: { name: true } },
            request: {
              select: {
                slug: true,
                title: true,
                company: { select: { ownerId: true } },
              },
            },
          },
        });
        if (app?.request.company.ownerId) {
          await this.notifications.emit({
            userId: app.request.company.ownerId,
            type: 'test.submitted',
            payload: {
              title: `Test submitted for "${app.request.title}"`,
              body: `${app.trainer?.name ?? 'A trainer'} submitted the evaluation. ${
                hasManualTask ? 'Manual grading required.' : `Auto-score: ${autoPercent}%.`
              }`,
              href: `/company/requests/${app.request.slug}/applications/${app.id}`,
              meta: { applicationId: app.id, attemptId, testId: attempt.testId },
            },
          });
        }
      }
      return result;
    });
  }

  async listAttemptsForTrainer(trainerId: string) {
    return this.prisma.testAttempt.findMany({
      where: { trainerId },
      orderBy: { createdAt: 'desc' },
      include: { test: { select: { id: true, title: true, requestId: true } } },
    });
  }

  // =========================================================================
  // Company — reviewing / grading
  // =========================================================================

  async findAttempt(userId: string, userRole: string, attemptId: string) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            request: { include: { company: { select: { ownerId: true, name: true } } } },
            tasks: { orderBy: { order: 'asc' } },
          },
        },
        responses: true,
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const isOwner = attempt.test.request?.company.ownerId === userId;
    const isTrainer = attempt.trainerId === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isOwner && !isTrainer && !isAdmin) {
      throw new ForbiddenException('Not allowed to view this attempt');
    }

    // Trainers never see answerKey/rubric or reviewerNotes
    if (!isOwner && !isAdmin) {
      return {
        ...attempt,
        reviewerNotes: null,
        test: {
          ...attempt.test,
          tasks: attempt.test.tasks.map((t) => ({ ...t, answerKey: null, rubric: null })),
        },
      };
    }
    return attempt;
  }

  async gradeAttempt(
    ownerId: string,
    attemptId: string,
    input: GradeAttemptInput,
    ctx: RequestContext = {},
  ) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            tasks: true,
            request: { include: { company: { select: { ownerId: true } } } },
          },
        },
        responses: true,
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.test.request?.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your test');
    }
    if (attempt.status !== 'SUBMITTED' && attempt.status !== 'GRADED') {
      throw new BadRequestException(`Attempt must be submitted to grade (current: ${attempt.status})`);
    }

    const tasksById = new Map(attempt.test.tasks.map((t) => [t.id, t]));
    for (const grade of input.grades) {
      const task = tasksById.get(grade.taskId);
      if (!task) {
        throw new BadRequestException(`Task ${grade.taskId} is not part of this attempt's test`);
      }
      if (grade.manualScore > task.maxScore) {
        throw new BadRequestException(
          `manualScore ${grade.manualScore} exceeds task maxScore ${task.maxScore} for task ${task.id}`,
        );
      }
    }

    const updatedAttempt = await this.prisma.$transaction(async (tx) => {
      for (const grade of input.grades) {
        await tx.testTaskResponse.upsert({
          where: { attemptId_taskId: { attemptId, taskId: grade.taskId } },
          update: {
            manualScore: grade.manualScore,
            comments: grade.comments ?? null,
          },
          create: {
            attemptId,
            taskId: grade.taskId,
            response: {},
            manualScore: grade.manualScore,
            comments: grade.comments ?? null,
          },
        });
      }

      // Recompute totals from the canonical rows
      const rows = await tx.testTaskResponse.findMany({ where: { attemptId } });
      let autoTotal = 0;
      let autoMaxTotal = 0;
      let manualTotal = 0;
      let manualMaxTotal = 0;
      let maxTotal = 0;
      for (const task of attempt.test.tasks) {
        maxTotal += task.maxScore;
        const row = rows.find((r) => r.taskId === task.id);
        const isAutoGradable = task.type === 'MCQ' && !!task.answerKey;
        if (isAutoGradable) {
          autoMaxTotal += task.maxScore;
          autoTotal += row?.autoScore ?? 0;
        } else {
          manualMaxTotal += task.maxScore;
          manualTotal += row?.manualScore ?? 0;
        }
      }
      const totalScore =
        maxTotal > 0 ? Math.round(((autoTotal + manualTotal) / maxTotal) * 100) : 0;

      const updated = await tx.testAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'GRADED',
          totalScore,
          reviewerNotes: input.reviewerNotes ?? attempt.reviewerNotes ?? null,
          scoreBreakdown: {
            autoTotal,
            autoMax: autoMaxTotal,
            autoPercent:
              autoMaxTotal > 0 ? Math.round((autoTotal / autoMaxTotal) * 100) : 0,
            manualTotal,
            manualMax: manualMaxTotal,
            max: maxTotal,
            requiresManualGrading: false,
          },
        },
        include: { responses: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTIONS.TEST_ATTEMPT_GRADED,
          entityType: 'TestAttempt',
          entityId: attemptId,
          ip: ctx.ip ?? null,
          diff: {
            totalScore,
            passingScore: attempt.test.passingScore,
            autoTotal,
            manualTotal,
            max: maxTotal,
            applicationId: attempt.applicationId,
            locale: ctx.locale ?? null,
          },
        },
      });

      return updated;
    });

    // Notify trainer that the test was graded.
    if (updatedAttempt) {
      const app = attempt.applicationId
        ? await this.prisma.application.findUnique({
            where: { id: attempt.applicationId },
            include: {
              request: { select: { slug: true, title: true } },
            },
          })
        : null;
      const passed =
        updatedAttempt.totalScore != null &&
        updatedAttempt.totalScore >= attempt.test.passingScore;
      await this.notifications.emit({
        userId: attempt.trainerId,
        type: 'test.graded',
        payload: {
          title: `Your test was graded${app?.request.title ? ` — "${app.request.title}"` : ''}`,
          body: `Final score: ${updatedAttempt.totalScore ?? 0}/100 — ${
            passed ? 'passed.' : 'did not pass.'
          }`,
          href: app ? `/trainer/applications/${app.id}/test` : '/trainer/dashboard',
          meta: {
            attemptId,
            applicationId: attempt.applicationId,
            totalScore: updatedAttempt.totalScore,
            passed,
          },
        },
        email: {
          subject: `Your Trainova AI test was graded`,
          html: `<p>Your attempt on <strong>${attempt.test.title}</strong> has been graded.</p><p>Final score: <strong>${
            updatedAttempt.totalScore ?? 0
          }/100</strong> — ${passed ? 'you passed.' : 'you did not pass this time.'}</p>`,
        },
      });
    }

    return updatedAttempt;
  }

  // Returns the test assigned to an application, along with any existing
  // attempt for this (application, trainer) tuple. The assigned testId is
  // resolved from the latest assign-test audit entry so we don't need a
  // dedicated column on Application. Trainer sees the public test shape
  // (answerKey / rubric stripped, same as findOneForUser).
  async getAssignedTestForApplication(
    userId: string,
    userRole: string,
    applicationId: string,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: { select: { ownerId: true } } } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    const isOwner = app.request.company.ownerId === userId;
    const isTrainer = app.trainerId === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isOwner && !isTrainer && !isAdmin) {
      throw new ForbiddenException('Not allowed to view this application');
    }

    // Prefer the most recent attempt's test (authoritative once the trainer
    // has started). Fallback to the latest assign-test audit entry for the
    // TEST_ASSIGNED → no-attempt-yet window.
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { applicationId, trainerId: app.trainerId },
      orderBy: { createdAt: 'desc' },
    });

    let testId: string | null = attempt?.testId ?? null;
    if (!testId) {
      const auditRow = await this.prisma.auditLog.findFirst({
        where: {
          entityType: 'Application',
          entityId: applicationId,
          action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
        },
        orderBy: { createdAt: 'desc' },
      });
      const diff = (auditRow?.diff ?? null) as { testId?: unknown } | null;
      if (diff && typeof diff.testId === 'string') {
        testId = diff.testId;
      }
    }
    if (!testId) {
      return { test: null, attempt: null };
    }

    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: {
        tasks: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            prompt: true,
            type: true,
            options: true,
            maxScore: true,
            order: true,
            // answerKey + rubric intentionally excluded
          },
        },
      },
    });
    if (!test) return { test: null, attempt };

    // Strip reviewerNotes from the attempt for trainer callers.
    const attemptPayload =
      attempt && !isOwner && !isAdmin ? { ...attempt, reviewerNotes: null } : attempt;
    return { test, attempt: attemptPayload };
  }

  async listAttemptsForApplication(userId: string, userRole: string, applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: { select: { ownerId: true } } } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    const isOwner = app.request.company.ownerId === userId;
    const isTrainer = app.trainerId === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isOwner && !isTrainer && !isAdmin) {
      throw new ForbiddenException('Not allowed to view these attempts');
    }
    const attempts = await this.prisma.testAttempt.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
      include: { test: { select: { id: true, title: true, passingScore: true } } },
    });
    // reviewerNotes are company/admin-only; mirror the stripping done in
    // findAttempt so the list-variant doesn't leak them to trainer callers.
    if (!isOwner && !isAdmin) {
      return attempts.map((a) => ({ ...a, reviewerNotes: null }));
    }
    return attempts;
  }

  // =========================================================================
  // Assign test (used by ApplicationsService) — sends email + writes audit
  // =========================================================================

  async sendAssignmentEmail(
    applicationId: string,
    testId: string,
  ): Promise<void> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        trainer: { select: { email: true, name: true, locale: true } },
        request: { include: { company: { select: { name: true } } } },
      },
    });
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: { title: true, timeLimitMin: true },
    });
    if (!app || !test) return;

    const locale = EmailService.normalizeLocale(app.trainer.locale ?? 'en');
    const base =
      this.config.get<string>('NEXT_PUBLIC_SITE_URL') ??
      this.config.get<string>('APP_URL') ??
      'http://localhost:3000';
    const takeUrl = `${base.replace(/\/+$/, '')}/${locale}/trainer/tests`;
    await this.email.sendTestAssigned(app.trainer.email, {
      locale,
      name: app.trainer.name,
      companyName: app.request.company.name,
      testTitle: test.title,
      takeUrl,
      timeLimitMin: test.timeLimitMin ?? undefined,
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async assertRequestOwner(ownerId: string, requestId: string): Promise<void> {
    const request = await this.prisma.jobRequest.findUnique({
      where: { id: requestId },
      include: { company: { select: { ownerId: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your request');
    }
  }

  private async loadOwnedTest(ownerId: string, testId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: { request: { include: { company: { select: { ownerId: true } } } } },
    });
    if (!test) throw new NotFoundException('Test not found');
    if (test.request?.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your test');
    }
    return test;
  }

  private taskCreateData(task: TestTaskInput, index: number) {
    return {
      prompt: task.prompt,
      type: task.type,
      options: task.options ?? [],
      answerKey: task.type === 'MCQ' ? (task.answerKey ?? null) : null,
      rubric: task.rubric ?? undefined,
      maxScore: task.maxScore ?? 10,
      order: task.order ?? index,
    };
  }

  private taskUpdateData(task: TestTaskInput, index: number) {
    return {
      prompt: task.prompt,
      type: task.type,
      options: task.options ?? [],
      answerKey: task.type === 'MCQ' ? (task.answerKey ?? null) : null,
      rubric: task.rubric ?? undefined,
      maxScore: task.maxScore ?? 10,
      order: task.order ?? index,
    };
  }

  private normalizeResponseForStorage(value: unknown): object {
    if (value === null || value === undefined) return { value: null };
    if (typeof value === 'object') return value as object;
    return { value } as object;
  }
}
