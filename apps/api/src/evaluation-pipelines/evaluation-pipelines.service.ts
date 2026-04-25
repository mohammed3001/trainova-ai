import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ApplicationPipelineProgressDto,
  type ApplicationPipelineSnapshotDto,
  type ApplicationStageResultDto,
  type AdvanceStageInput,
  type CreatePipelineInput,
  type EvaluationPipelineDto,
  type EvaluationStageDto,
  type RejectStageInput,
  type ReplaceStagesInput,
  type SkipStageInput,
  type UpdatePipelineInput,
} from '@trainova/shared';
import { Prisma } from '@trainova/db';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const pipelineInclude = {
  stages: {
    orderBy: { order: 'asc' as const },
    include: { test: { select: { id: true, title: true, passingScore: true } } },
  },
} satisfies Prisma.EvaluationPipelineInclude;

const progressInclude = {
  results: {
    orderBy: { stage: { order: 'asc' as const } },
    include: { reviewedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ApplicationPipelineProgressInclude;

type PipelineWithRelations = Prisma.EvaluationPipelineGetPayload<{
  include: typeof pipelineInclude;
}>;

type ProgressWithRelations = Prisma.ApplicationPipelineProgressGetPayload<{
  include: typeof progressInclude;
}>;

/**
 * T8.D — Multi-stage evaluation pipelines.
 *
 * Each `JobRequest` can have one active `EvaluationPipeline`. Companies
 * move applicants into the pipeline once and progress them stage by
 * stage. SCREENING / REVIEW stages are graded manually; TEST stages
 * cross-reference the latest graded `TestAttempt` for that applicant.
 * INTERVIEW stages don't auto-progress — the company marks pass/fail
 * after running the meeting (see PR #60 for the meeting workflow).
 */
@Injectable()
export class EvaluationPipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // =========================================================================
  // Pipeline CRUD (company-side)
  // =========================================================================

  async create(ownerId: string, input: CreatePipelineInput): Promise<EvaluationPipelineDto> {
    const request = await this.assertRequestOwnership(ownerId, input.requestId);
    if (await this.prisma.evaluationPipeline.findUnique({ where: { requestId: request.id } })) {
      throw new ConflictException('Pipeline already exists for this request');
    }
    if (input.stages.some((s) => s.testId)) {
      await this.assertTestsBelongToCompany(
        request.companyId,
        input.stages.map((s) => s.testId).filter((v): v is string => Boolean(v)),
      );
    }

    const pipeline = await this.prisma.evaluationPipeline.create({
      data: {
        requestId: request.id,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        stages: {
          create: input.stages.map((stage, index) => ({
            order: index,
            kind: stage.kind,
            title: stage.title,
            description: stage.description ?? null,
            testId: stage.kind === 'TEST' ? stage.testId ?? null : null,
            passingScore: stage.kind === 'TEST' ? stage.passingScore ?? null : null,
            isRequired: stage.isRequired ?? true,
          })),
        },
      },
      include: pipelineInclude,
    });
    return this.toPipelineDto(pipeline, await this.loadStats(pipeline.id));
  }

  async getByRequest(ownerId: string, requestId: string): Promise<EvaluationPipelineDto | null> {
    await this.assertRequestOwnership(ownerId, requestId);
    const pipeline = await this.prisma.evaluationPipeline.findUnique({
      where: { requestId },
      include: pipelineInclude,
    });
    if (!pipeline) return null;
    return this.toPipelineDto(pipeline, await this.loadStats(pipeline.id));
  }

  async update(
    ownerId: string,
    pipelineId: string,
    patch: UpdatePipelineInput,
  ): Promise<EvaluationPipelineDto> {
    const pipeline = await this.loadPipelineForOwner(ownerId, pipelineId);
    const updated = await this.prisma.evaluationPipeline.update({
      where: { id: pipeline.id },
      data: {
        name: patch.name ?? undefined,
        description: patch.description === '' ? null : patch.description ?? undefined,
        isActive: patch.isActive ?? undefined,
      },
      include: pipelineInclude,
    });
    return this.toPipelineDto(updated, await this.loadStats(updated.id));
  }

  /**
   * Atomically replace the stage list. Stages keyed by an existing `id`
   * keep their persisted `ApplicationStageResult` rows; omitted ids are
   * deleted (cascades the result rows by FK). Reorders rewrite every
   * `order` in one transaction so the `(pipelineId, order)` uniqueness
   * is preserved without temp values.
   */
  async replaceStages(
    ownerId: string,
    pipelineId: string,
    input: ReplaceStagesInput,
  ): Promise<EvaluationPipelineDto> {
    const pipeline = await this.loadPipelineForOwner(ownerId, pipelineId);
    if (input.stages.some((s) => s.testId)) {
      await this.assertTestsBelongToCompany(
        pipeline.request.companyId,
        input.stages.map((s) => s.testId).filter((v): v is string => Boolean(v)),
      );
    }
    const incomingIds = new Set(input.stages.map((s) => s.id).filter((v): v is string => Boolean(v)));
    const existing = pipeline.stages;
    const removedStageIds = existing.filter((s) => !incomingIds.has(s.id)).map((s) => s.id);

    // Removing stages while applications are in-progress would orphan
    // their `currentStageId` (no FK on that column — see schema.prisma)
    // and leave callers with a confusing 'Current stage not found' on
    // the next advance/reject/skip. Block the operation in that case to
    // match the convention used by `remove()` above.
    if (removedStageIds.length > 0 && pipeline.progresses.length > 0) {
      throw new ConflictException(
        'Cannot remove stages while applicants are still in progress; archive the pipeline or finish their progress first',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Delete stages no longer in the payload first — cascades the
      // `ApplicationStageResult` rows so the unique (progressId, stageId)
      // constraint can't trip when we re-create later.
      const removed = existing.filter((s) => !incomingIds.has(s.id));
      if (removed.length) {
        await tx.evaluationStage.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } });
      }

      // Two-phase reorder: temporarily push every existing stage to a
      // negative `order` (`-1 - order`) so the unique constraint can't
      // trip mid-renumber, then write the final ordering.
      for (const stage of existing.filter((s) => incomingIds.has(s.id))) {
        await tx.evaluationStage.update({
          where: { id: stage.id },
          data: { order: -1 - stage.order },
        });
      }

      for (const [i, stage] of input.stages.entries()) {
        if (stage.id) {
          await tx.evaluationStage.update({
            where: { id: stage.id },
            data: {
              order: i,
              kind: stage.kind,
              title: stage.title,
              description: stage.description ?? null,
              testId: stage.kind === 'TEST' ? stage.testId ?? null : null,
              passingScore: stage.kind === 'TEST' ? stage.passingScore ?? null : null,
              isRequired: stage.isRequired ?? true,
            },
          });
        } else {
          await tx.evaluationStage.create({
            data: {
              pipelineId: pipeline.id,
              order: i,
              kind: stage.kind,
              title: stage.title,
              description: stage.description ?? null,
              testId: stage.kind === 'TEST' ? stage.testId ?? null : null,
              passingScore: stage.kind === 'TEST' ? stage.passingScore ?? null : null,
              isRequired: stage.isRequired ?? true,
            },
          });
        }
      }
    });

    const reloaded = await this.prisma.evaluationPipeline.findUniqueOrThrow({
      where: { id: pipeline.id },
      include: pipelineInclude,
    });
    return this.toPipelineDto(reloaded, await this.loadStats(reloaded.id));
  }

  async remove(ownerId: string, pipelineId: string): Promise<void> {
    const pipeline = await this.loadPipelineForOwner(ownerId, pipelineId);
    if (pipeline.progresses.length > 0) {
      throw new ConflictException(
        'Cannot delete a pipeline that already has applicants in progress; archive it instead',
      );
    }
    await this.prisma.evaluationPipeline.delete({ where: { id: pipeline.id } });
  }

  // =========================================================================
  // Per-application progress
  // =========================================================================

  async getApplicationSnapshot(
    callerId: string,
    applicationId: string,
  ): Promise<ApplicationPipelineSnapshotDto | null> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: { select: { ownerId: true } } } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    const isOwner = application.request.company.ownerId === callerId;
    const isApplicant = application.trainerId === callerId;
    if (!isOwner && !isApplicant) {
      throw new ForbiddenException('Not your application');
    }

    const pipeline = await this.prisma.evaluationPipeline.findUnique({
      where: { requestId: application.requestId },
      include: pipelineInclude,
    });
    if (!pipeline || !pipeline.isActive) return null;

    const progress = await this.prisma.applicationPipelineProgress.findUnique({
      where: { applicationId },
      include: progressInclude,
    });
    return {
      pipeline: this.toPipelineDto(pipeline, await this.loadStats(pipeline.id)),
      progress: progress ? this.toProgressDto(progress) : null,
    };
  }

  async startProgress(
    ownerId: string,
    applicationId: string,
  ): Promise<ApplicationPipelineProgressDto> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: { select: { ownerId: true } } } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your application');
    }

    const pipeline = await this.prisma.evaluationPipeline.findUnique({
      where: { requestId: application.requestId },
      include: pipelineInclude,
    });
    if (!pipeline) throw new NotFoundException('Request has no pipeline');
    if (!pipeline.isActive) throw new ConflictException('Pipeline is archived');
    if (pipeline.stages.length === 0) throw new ConflictException('Pipeline has no stages');

    const existing = await this.prisma.applicationPipelineProgress.findUnique({
      where: { applicationId },
      include: progressInclude,
    });
    if (existing) return this.toProgressDto(existing);

    const [firstStage] = pipeline.stages;
    if (!firstStage) throw new ConflictException('Pipeline has no stages');
    const firstStageId = firstStage.id;
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.applicationPipelineProgress.create({
        data: {
          pipelineId: pipeline.id,
          applicationId,
          status: 'IN_PROGRESS',
          currentStageId: firstStageId,
          results: {
            create: pipeline.stages.map((stage) => ({
              stageId: stage.id,
              status: stage.id === firstStageId ? 'IN_PROGRESS' : 'PENDING',
              startedAt: stage.id === firstStageId ? new Date() : null,
            })),
          },
        },
        include: progressInclude,
      });
      return row;
    });

    void this.notifyApplicant(application.trainerId, applicationId, 'started', firstStage.title);
    return this.toProgressDto(created);
  }

  async advanceStage(
    ownerId: string,
    progressId: string,
    input: AdvanceStageInput,
  ): Promise<ApplicationPipelineProgressDto> {
    const { progress, application } = await this.loadProgressForOwner(ownerId, progressId);
    if (progress.status !== 'IN_PROGRESS' || !progress.currentStageId) {
      throw new ConflictException(`Pipeline is already ${progress.status.toLowerCase()}`);
    }
    const stage = progress.pipeline.stages.find((s) => s.id === progress.currentStageId);
    if (!stage) throw new NotFoundException('Current stage not found');

    let resolvedScore = input.score ?? null;
    if (stage.kind === 'TEST' && stage.testId) {
      const attempt = await this.prisma.testAttempt.findFirst({
        where: { testId: stage.testId, applicationId: application.id, status: 'GRADED' },
        orderBy: { updatedAt: 'desc' },
        select: { totalScore: true },
      });
      if (!attempt) {
        throw new ConflictException('No graded test attempt yet for this stage');
      }
      const cutoff = stage.passingScore ?? stage.test?.passingScore ?? 60;
      const score = attempt.totalScore ?? 0;
      if (score < cutoff) {
        throw new ConflictException(
          `Test score ${score} is below the passing cutoff ${cutoff}; reject the stage instead`,
        );
      }
      resolvedScore = score;
    }

    const nextStage = this.findNextStage(progress.pipeline, stage.order);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.applicationStageResult.update({
        where: { progressId_stageId: { progressId: progress.id, stageId: stage.id } },
        data: {
          status: 'PASSED',
          score: resolvedScore,
          notes: input.notes ?? null,
          reviewedById: ownerId,
          finishedAt: new Date(),
        },
      });
      if (nextStage) {
        await tx.applicationStageResult.update({
          where: { progressId_stageId: { progressId: progress.id, stageId: nextStage.id } },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });
        return tx.applicationPipelineProgress.update({
          where: { id: progress.id },
          data: { currentStageId: nextStage.id },
          include: progressInclude,
        });
      }
      return tx.applicationPipelineProgress.update({
        where: { id: progress.id },
        data: { currentStageId: null, status: 'PASSED', finishedAt: new Date() },
        include: progressInclude,
      });
    });

    void this.notifyApplicant(
      application.trainerId,
      application.id,
      nextStage ? 'advanced' : 'passed',
      nextStage?.title ?? null,
    );
    return this.toProgressDto(updated);
  }

  async rejectStage(
    ownerId: string,
    progressId: string,
    input: RejectStageInput,
  ): Promise<ApplicationPipelineProgressDto> {
    const { progress, application } = await this.loadProgressForOwner(ownerId, progressId);
    if (progress.status !== 'IN_PROGRESS' || !progress.currentStageId) {
      throw new ConflictException(`Pipeline is already ${progress.status.toLowerCase()}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.applicationStageResult.update({
        where: {
          progressId_stageId: {
            progressId: progress.id,
            stageId: progress.currentStageId as string,
          },
        },
        data: {
          status: 'FAILED',
          notes: input.reason ?? null,
          reviewedById: ownerId,
          finishedAt: new Date(),
        },
      });
      return tx.applicationPipelineProgress.update({
        where: { id: progress.id },
        data: { currentStageId: null, status: 'FAILED', finishedAt: new Date() },
        include: progressInclude,
      });
    });

    void this.notifyApplicant(application.trainerId, application.id, 'rejected', null);
    return this.toProgressDto(updated);
  }

  async skipStage(
    ownerId: string,
    progressId: string,
    input: SkipStageInput,
  ): Promise<ApplicationPipelineProgressDto> {
    const { progress, application } = await this.loadProgressForOwner(ownerId, progressId);
    if (progress.status !== 'IN_PROGRESS' || !progress.currentStageId) {
      throw new ConflictException(`Pipeline is already ${progress.status.toLowerCase()}`);
    }
    const stage = progress.pipeline.stages.find((s) => s.id === progress.currentStageId);
    if (!stage) throw new NotFoundException('Current stage not found');
    if (stage.isRequired) {
      throw new BadRequestException('Required stages cannot be skipped');
    }

    const nextStage = this.findNextStage(progress.pipeline, stage.order);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.applicationStageResult.update({
        where: { progressId_stageId: { progressId: progress.id, stageId: stage.id } },
        data: {
          status: 'SKIPPED',
          notes: input.reason ?? null,
          reviewedById: ownerId,
          finishedAt: new Date(),
        },
      });
      if (nextStage) {
        await tx.applicationStageResult.update({
          where: { progressId_stageId: { progressId: progress.id, stageId: nextStage.id } },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });
        return tx.applicationPipelineProgress.update({
          where: { id: progress.id },
          data: { currentStageId: nextStage.id },
          include: progressInclude,
        });
      }
      return tx.applicationPipelineProgress.update({
        where: { id: progress.id },
        data: { currentStageId: null, status: 'PASSED', finishedAt: new Date() },
        include: progressInclude,
      });
    });

    void this.notifyApplicant(
      application.trainerId,
      application.id,
      nextStage ? 'advanced' : 'passed',
      nextStage?.title ?? null,
    );
    return this.toProgressDto(updated);
  }

  async withdrawProgress(
    callerId: string,
    progressId: string,
  ): Promise<ApplicationPipelineProgressDto> {
    const progress = await this.prisma.applicationPipelineProgress.findUnique({
      where: { id: progressId },
      include: {
        ...progressInclude,
        application: { include: { request: { include: { company: { select: { ownerId: true } } } } } },
      },
    });
    if (!progress) throw new NotFoundException('Progress not found');
    const isOwner = progress.application.request.company.ownerId === callerId;
    const isApplicant = progress.application.trainerId === callerId;
    if (!isOwner && !isApplicant) {
      throw new ForbiddenException('Not your application');
    }
    if (progress.status !== 'IN_PROGRESS') {
      throw new ConflictException(`Pipeline is already ${progress.status.toLowerCase()}`);
    }

    const updated = await this.prisma.applicationPipelineProgress.update({
      where: { id: progress.id },
      data: { currentStageId: null, status: 'WITHDRAWN', finishedAt: new Date() },
      include: progressInclude,
    });
    return this.toProgressDto(updated);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async assertRequestOwnership(ownerId: string, requestId: string) {
    const request = await this.prisma.jobRequest.findUnique({
      where: { id: requestId },
      include: { company: { select: { ownerId: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your request');
    }
    return request;
  }

  private async assertTestsBelongToCompany(companyId: string, testIds: string[]) {
    if (testIds.length === 0) return;
    const tests = await this.prisma.test.findMany({
      where: { id: { in: testIds } },
      select: { id: true, request: { select: { companyId: true } } },
    });
    const found = new Set(tests.map((t) => t.id));
    const missing = testIds.find((id) => !found.has(id));
    if (missing) throw new NotFoundException(`Test ${missing} not found`);
    // Reject orphan tests too — `Test.requestId` is `SetNull` when the
    // parent `JobRequest` is deleted (schema.prisma), so a missing
    // `request` would otherwise pass the original `t.request &&` check
    // and let any company attach those tests to its pipeline.
    const foreign = tests.find((t) => !t.request || t.request.companyId !== companyId);
    if (foreign) {
      throw new ForbiddenException(`Test ${foreign.id} belongs to another company`);
    }
  }

  private async loadPipelineForOwner(ownerId: string, pipelineId: string) {
    const pipeline = await this.prisma.evaluationPipeline.findUnique({
      where: { id: pipelineId },
      include: {
        ...pipelineInclude,
        request: { include: { company: { select: { ownerId: true } } } },
        progresses: { select: { id: true } },
      },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    if (pipeline.request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your pipeline');
    }
    return pipeline;
  }

  private async loadProgressForOwner(ownerId: string, progressId: string) {
    const progress = await this.prisma.applicationPipelineProgress.findUnique({
      where: { id: progressId },
      include: {
        ...progressInclude,
        pipeline: { include: pipelineInclude },
        application: { include: { request: { include: { company: { select: { ownerId: true } } } } } },
      },
    });
    if (!progress) throw new NotFoundException('Progress not found');
    if (progress.application.request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your application');
    }
    return { progress, application: progress.application };
  }

  private findNextStage<T extends { id: string; order: number }>(
    pipeline: { stages: T[] },
    currentOrder: number,
  ): T | null {
    return pipeline.stages.find((s) => s.order > currentOrder) ?? null;
  }

  private async loadStats(pipelineId: string) {
    const grouped = await this.prisma.applicationPipelineProgress.groupBy({
      by: ['status'],
      where: { pipelineId },
      _count: { _all: true },
    });
    const stats = { inProgress: 0, passed: 0, failed: 0, withdrawn: 0 };
    for (const row of grouped) {
      const count = row._count._all;
      if (row.status === 'IN_PROGRESS') stats.inProgress = count;
      else if (row.status === 'PASSED') stats.passed = count;
      else if (row.status === 'FAILED') stats.failed = count;
      else if (row.status === 'WITHDRAWN') stats.withdrawn = count;
    }
    return stats;
  }

  private async notifyApplicant(
    trainerId: string,
    applicationId: string,
    kind: 'started' | 'advanced' | 'passed' | 'rejected',
    nextStageTitle: string | null,
  ) {
    const titles: Record<typeof kind, string> = {
      started: 'You entered an evaluation pipeline',
      advanced: 'Stage passed — moving forward',
      passed: 'Evaluation pipeline passed',
      rejected: 'Evaluation pipeline closed',
    };
    const body = nextStageTitle ? `Next: ${nextStageTitle}` : '';
    try {
      await this.notifications.emit({
        userId: trainerId,
        type: 'system.announcement',
        payload: {
          title: titles[kind],
          body,
          href: `/applications/${applicationId}`,
          meta: { applicationId, kind },
        },
      });
    } catch {
      // Non-fatal — progress row is already authoritative.
    }
  }

  // -- DTO mappers ----------------------------------------------------------

  private toPipelineDto(
    pipeline: PipelineWithRelations,
    stats: EvaluationPipelineDto['stats'],
  ): EvaluationPipelineDto {
    return {
      id: pipeline.id,
      requestId: pipeline.requestId,
      name: pipeline.name,
      description: pipeline.description,
      isActive: pipeline.isActive,
      stages: pipeline.stages.map((s) => this.toStageDto(s)),
      stats,
      createdAt: pipeline.createdAt.toISOString(),
      updatedAt: pipeline.updatedAt.toISOString(),
    };
  }

  private toStageDto(stage: PipelineWithRelations['stages'][number]): EvaluationStageDto {
    return {
      id: stage.id,
      pipelineId: stage.pipelineId,
      order: stage.order,
      kind: stage.kind,
      title: stage.title,
      description: stage.description,
      testId: stage.testId,
      testTitle: stage.test?.title ?? null,
      passingScore: stage.passingScore,
      isRequired: stage.isRequired,
      createdAt: stage.createdAt.toISOString(),
      updatedAt: stage.updatedAt.toISOString(),
    };
  }

  private toProgressDto(progress: ProgressWithRelations): ApplicationPipelineProgressDto {
    return {
      id: progress.id,
      pipelineId: progress.pipelineId,
      applicationId: progress.applicationId,
      status: progress.status,
      currentStageId: progress.currentStageId,
      results: progress.results.map<ApplicationStageResultDto>((r) => ({
        id: r.id,
        stageId: r.stageId,
        status: r.status,
        score: r.score,
        notes: r.notes,
        reviewedById: r.reviewedById,
        reviewedByName: r.reviewedBy?.name ?? null,
        startedAt: r.startedAt?.toISOString() ?? null,
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
      startedAt: progress.startedAt.toISOString(),
      finishedAt: progress.finishedAt?.toISOString() ?? null,
      createdAt: progress.createdAt.toISOString(),
      updatedAt: progress.updatedAt.toISOString(),
    };
  }
}

