import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  AUDIT_ACTIONS,
  type ReviewListItem,
  type ReviewListQuery,
  type ReviewSummary,
  type SubmitReviewInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * T5.E — Reviews tied to completed contracts.
 *
 * Either party of a `Contract` whose status is `COMPLETED` may leave one
 * review on the other. Each pair (author, contract) is unique. We expose
 * read paths for trainer profiles + per-contract introspection.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(actorId: string, input: SubmitReviewInput): Promise<{ id: string }> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: input.contractId },
      select: {
        id: true,
        status: true,
        companyId: true,
        trainerId: true,
        company: { select: { ownerId: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    if (contract.status !== 'COMPLETED') {
      throw new BadRequestException(
        `Reviews are only allowed on COMPLETED contracts (current: ${contract.status})`,
      );
    }

    // Determine target. The company-side reviewer is *the company owner*
    // (single account responsible for the engagement). The trainer-side
    // reviewer is the trainer themselves.
    let targetId: string | null = null;
    if (contract.trainerId === actorId) {
      targetId = contract.company.ownerId;
    } else if (contract.company.ownerId === actorId) {
      targetId = contract.trainerId;
    } else {
      throw new ForbiddenException(
        'Only the contract trainer or the owning company may leave a review',
      );
    }

    const existing = await this.prisma.review.findUnique({
      where: { authorId_contractId: { authorId: actorId, contractId: contract.id } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A review for this contract already exists');
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          authorId: actorId,
          targetId,
          contractId: contract.id,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: AUDIT_ACTIONS.REVIEW_SUBMITTED,
          entityType: 'Review',
          entityId: created.id,
          diff: { contractId: contract.id, rating: input.rating } as Prisma.JsonObject,
        },
      });
      return created;
    });

    return { id: review.id };
  }

  async listForTrainer(
    trainerSlug: string,
    query: ReviewListQuery,
  ): Promise<{ items: ReviewListItem[]; total: number; summary: ReviewSummary }> {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { slug: trainerSlug },
      select: { userId: true },
    });
    if (!profile) throw new NotFoundException('Trainer not found');

    return this.listForUser(profile.userId, query);
  }

  async listForUser(
    userId: string,
    query: ReviewListQuery,
  ): Promise<{ items: ReviewListItem[]; total: number; summary: ReviewSummary }> {
    const where: Prisma.ReviewWhereInput = { targetId: userId };
    const [rows, total, agg] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          author: { select: { id: true, name: true, avatarUrl: true, role: true } },
          contract: { select: { id: true, title: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
    ]);

    const distribution: ReviewSummary['distribution'] = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    let weighted = 0;
    let count = 0;
    for (const r of agg) {
      const k = String(r.rating) as keyof ReviewSummary['distribution'];
      if (k in distribution) {
        distribution[k] = r._count._all;
        weighted += r.rating * r._count._all;
        count += r._count._all;
      }
    }
    const averageRating = count === 0 ? 0 : Math.round((weighted / count) * 10) / 10;

    const items: ReviewListItem[] = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      contractId: r.contractId,
      contractTitle: r.contract?.title ?? null,
      author: {
        id: r.author.id,
        displayName: r.author.name,
        avatarUrl: r.author.avatarUrl,
        role: r.author.role === 'TRAINER' ? 'TRAINER' : 'COMPANY',
      },
    }));

    return {
      items,
      total,
      summary: { count, averageRating, distribution },
    };
  }

  async listEligibleForActor(actorId: string): Promise<
    {
      contractId: string;
      title: string;
      counterpartyName: string;
      completedAt: string;
      hasReview: boolean;
    }[]
  > {
    const contracts = await this.prisma.contract.findMany({
      where: {
        status: 'COMPLETED',
        OR: [{ trainerId: actorId }, { company: { ownerId: actorId } }],
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        completedAt: true,
        trainerId: true,
        trainer: { select: { name: true } },
        company: { select: { name: true, ownerId: true } },
        reviews: {
          where: { authorId: actorId },
          select: { id: true },
        },
      },
    });
    return contracts.map((c) => ({
      contractId: c.id,
      title: c.title,
      counterpartyName:
        c.trainerId === actorId ? c.company.name : c.trainer.name,
      completedAt: (c.completedAt ?? new Date()).toISOString(),
      hasReview: c.reviews.length > 0,
    }));
  }
}
