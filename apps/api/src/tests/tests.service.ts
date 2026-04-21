import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(testId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: {
        tasks: {
          orderBy: { order: 'asc' },
          select: { id: true, prompt: true, type: true, options: true, maxScore: true, order: true },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async startAttempt(trainerId: string, testId: string, applicationId?: string) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('Test not found');
    return this.prisma.testAttempt.create({
      data: { testId, trainerId, applicationId: applicationId ?? null, status: 'IN_PROGRESS' },
    });
  }

  async submitAttempt(
    trainerId: string,
    attemptId: string,
    responses: Array<{ taskId: string; response: unknown }>,
  ) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: { test: { include: { tasks: true } } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.trainerId !== trainerId) throw new BadRequestException('Not your attempt');
    if (attempt.status !== 'IN_PROGRESS') throw new BadRequestException('Already submitted');

    let autoTotal = 0;
    let autoMaxTotal = 0;
    let maxTotal = 0;
    let hasManualTask = false;

    for (const task of attempt.test.tasks) {
      maxTotal += task.maxScore;
      const isAutoGradable = task.type === 'MCQ' && !!task.answerKey;
      if (isAutoGradable) {
        autoMaxTotal += task.maxScore;
      } else {
        hasManualTask = true;
      }
      const entry = responses.find((r) => r.taskId === task.id);
      if (!entry) continue;

      let autoScore: number | null = null;
      if (isAutoGradable) {
        autoScore = String(entry.response) === task.answerKey ? task.maxScore : 0;
        autoTotal += autoScore;
      }

      await this.prisma.testTaskResponse.upsert({
        where: { attemptId_taskId: { attemptId, taskId: task.id } },
        update: { response: entry.response as object, autoScore },
        create: {
          attemptId,
          taskId: task.id,
          response: entry.response as object,
          autoScore,
        },
      });
    }

    const autoPercent = autoMaxTotal > 0 ? Math.round((autoTotal / autoMaxTotal) * 100) : 0;
    const totalScore = hasManualTask ? null : autoPercent;
    return this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        totalScore,
        scoreBreakdown: {
          autoTotal,
          autoMax: autoMaxTotal,
          autoPercent,
          max: maxTotal,
          requiresManualGrading: hasManualTask,
        },
      },
      include: { responses: true },
    });
  }

  async listAttemptsForTrainer(trainerId: string) {
    return this.prisma.testAttempt.findMany({
      where: { trainerId },
      orderBy: { createdAt: 'desc' },
      include: { test: { select: { id: true, title: true, requestId: true } } },
    });
  }
}
