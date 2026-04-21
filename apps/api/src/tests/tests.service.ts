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

    let total = 0;
    let maxTotal = 0;

    for (const task of attempt.test.tasks) {
      maxTotal += task.maxScore;
      const entry = responses.find((r) => r.taskId === task.id);
      if (!entry) continue;

      let autoScore: number | null = null;
      if (task.type === 'MCQ' && task.answerKey) {
        autoScore = String(entry.response) === task.answerKey ? task.maxScore : 0;
        total += autoScore;
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

    const percent = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
    return this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        totalScore: percent,
        scoreBreakdown: { autoTotal: total, max: maxTotal },
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
