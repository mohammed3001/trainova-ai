import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, RiskLevel } from '@trainova/db';
import { isDisposableEmail } from './disposable-domains';

/**
 * Codes for individual fraud signals. Persisted as strings on
 * Application.riskFlags so the admin UI can render i18n labels and so
 * we can introduce new signals without a migration.
 */
export const RiskSignal = {
  /** Trainer email's domain matches the disposable provider list. */
  DISPOSABLE_EMAIL: 'DISPOSABLE_EMAIL',
  /** Trainer applied to many requests in a short window. */
  HIGH_VELOCITY: 'HIGH_VELOCITY',
  /** Trainer profile is empty (no headline/skills/portfolio). */
  EMPTY_PROFILE: 'EMPTY_PROFILE',
  /** Trainer account was created very recently relative to this apply. */
  NEW_ACCOUNT: 'NEW_ACCOUNT',
  /** Same answer payload across multiple applications by this trainer. */
  TEMPLATE_ANSWERS: 'TEMPLATE_ANSWERS',
  /** Proposed rate is far above the request's stated budget ceiling. */
  OVER_BUDGET: 'OVER_BUDGET',
  /** Trainer email has not been verified yet. */
  UNVERIFIED_EMAIL: 'UNVERIFIED_EMAIL',
} as const;
export type RiskSignalCode = (typeof RiskSignal)[keyof typeof RiskSignal];

/** Per-signal weight (sum is capped at 100). */
const SIGNAL_WEIGHTS: Record<RiskSignalCode, number> = {
  DISPOSABLE_EMAIL: 35,
  HIGH_VELOCITY: 25,
  EMPTY_PROFILE: 15,
  NEW_ACCOUNT: 10,
  TEMPLATE_ANSWERS: 25,
  OVER_BUDGET: 15,
  UNVERIFIED_EMAIL: 10,
};

/** Velocity threshold: number of applications within the window that flips the flag. */
const VELOCITY_LIMIT = 5;
const VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
/** Account age threshold for NEW_ACCOUNT. */
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
/** Multiplier on budgetMax beyond which OVER_BUDGET fires. */
const OVER_BUDGET_MULTIPLIER = 3;

function levelForScore(score: number): RiskLevel {
  if (score >= 90) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes fraud signals for an application and persists the resulting
   * score + flags. Safe to call best-effort: any failure is logged and
   * swallowed so a transient DB hiccup never tanks the apply flow. Existing
   * admin reviews (riskReviewedAt + riskReviewNote) are preserved.
   */
  async scoreApplication(applicationId: string): Promise<void> {
    try {
      await this.scoreApplicationOrThrow(applicationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`scoreApplication ${applicationId} failed: ${message}`);
    }
  }

  /**
   * Re-runs scoring without swallowing errors. Used by the admin endpoint so
   * a failed re-score surfaces a 5xx instead of silently returning stale data.
   */
  async scoreApplicationOrThrow(applicationId: string): Promise<{
    score: number;
    level: RiskLevel;
    flags: RiskSignalCode[];
  }> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        trainerId: true,
        proposedRate: true,
        answers: true,
        createdAt: true,
        request: { select: { budgetMax: true } },
      },
    });
    if (!app) throw new Error(`Application ${applicationId} not found`);

    const trainer = await this.prisma.user.findUnique({
      where: { id: app.trainerId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        trainerProfile: {
          select: {
            headline: true,
            bio: true,
          },
        },
      },
    });
    if (!trainer) throw new Error(`Trainer ${app.trainerId} not found`);

    const flags = new Set<RiskSignalCode>();

    if (isDisposableEmail(trainer.email)) flags.add(RiskSignal.DISPOSABLE_EMAIL);
    if (!trainer.emailVerifiedAt) flags.add(RiskSignal.UNVERIFIED_EMAIL);

    if (app.createdAt.getTime() - trainer.createdAt.getTime() < NEW_ACCOUNT_WINDOW_MS) {
      flags.add(RiskSignal.NEW_ACCOUNT);
    }

    const profile = trainer.trainerProfile;
    if (!profile || (!profile.headline?.trim() && !profile.bio?.trim())) {
      flags.add(RiskSignal.EMPTY_PROFILE);
    }

    // Velocity: count *other* applications by this trainer in the window.
    // Excludes the application being scored so a trainer's first apply
    // never trips the flag on itself.
    const since = new Date(app.createdAt.getTime() - VELOCITY_WINDOW_MS);
    const recentCount = await this.prisma.application.count({
      where: {
        trainerId: app.trainerId,
        id: { not: app.id },
        createdAt: { gte: since },
      },
    });
    if (recentCount >= VELOCITY_LIMIT) flags.add(RiskSignal.HIGH_VELOCITY);

    // Template answers: any other application by this trainer with a
    // non-trivial identical answers payload. We compare structurally on the
    // JSON value to catch copy-paste regardless of key ordering, since
    // Prisma stores `Json` columns as the canonical postgres jsonb form.
    const answersKey = canonicalJson(app.answers);
    if (answersKey && answersKey !== '{}' && answersKey.length > 8) {
      const peers = await this.prisma.application.findMany({
        where: {
          trainerId: app.trainerId,
          id: { not: app.id },
        },
        select: { answers: true },
        take: 25,
      });
      const duplicate = peers.some((p) => canonicalJson(p.answers) === answersKey);
      if (duplicate) flags.add(RiskSignal.TEMPLATE_ANSWERS);
    }

    // Over-budget: only fire when both sides have a number to compare. A
    // missing budgetMax means the company opted out of a ceiling; a missing
    // proposedRate means the trainer left it blank — neither is suspicious.
    if (
      typeof app.proposedRate === 'number' &&
      typeof app.request.budgetMax === 'number' &&
      app.request.budgetMax > 0 &&
      app.proposedRate > app.request.budgetMax * OVER_BUDGET_MULTIPLIER
    ) {
      flags.add(RiskSignal.OVER_BUDGET);
    }

    const flagList = Array.from(flags);
    const rawScore = flagList.reduce((sum, f) => sum + SIGNAL_WEIGHTS[f], 0);
    const score = Math.min(100, rawScore);
    const level = levelForScore(score);

    await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        riskScore: score,
        riskLevel: level,
        riskFlags: flagList,
        riskComputedAt: new Date(),
      },
    });

    return { score, level, flags: flagList };
  }

  async listForReview(input: {
    level?: RiskLevel;
    onlyUnreviewed?: boolean;
    take?: number;
    cursor?: string;
  }) {
    const take = Math.max(1, Math.min(100, input.take ?? 50));
    // No `level` filter ⇒ admin asked for the full inbox; only filter to a
    // specific level when one is explicitly requested. We still scope to rows
    // that have actually been scored so unrelated rows never appear.
    const where: Prisma.ApplicationWhereInput = input.level
      ? { riskLevel: input.level }
      : { riskLevel: { not: null } };
    if (input.onlyUnreviewed !== false) {
      where.riskReviewedAt = null;
    }
    const rows = await this.prisma.application.findMany({
      where,
      orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
      take: take + 1,
      ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
      select: {
        id: true,
        status: true,
        createdAt: true,
        riskScore: true,
        riskLevel: true,
        riskFlags: true,
        riskComputedAt: true,
        riskReviewedAt: true,
        riskReviewedBy: true,
        riskReviewNote: true,
        trainer: { select: { id: true, name: true, email: true } },
        request: {
          select: {
            id: true,
            slug: true,
            title: true,
            company: { select: { name: true, slug: true } },
          },
        },
      },
    });
    const nextCursor = rows.length > take ? rows[take]!.id : null;
    return {
      items: rows.slice(0, take),
      nextCursor,
    };
  }

  async markReviewed(input: {
    applicationId: string;
    adminId: string;
    note?: string | null;
  }) {
    return this.prisma.application.update({
      where: { id: input.applicationId },
      data: {
        riskReviewedAt: new Date(),
        riskReviewedBy: input.adminId,
        riskReviewNote: input.note ?? null,
      },
      select: {
        id: true,
        riskReviewedAt: true,
        riskReviewedBy: true,
        riskReviewNote: true,
      },
    });
  }

  async clearReview(applicationId: string) {
    return this.prisma.application.update({
      where: { id: applicationId },
      data: {
        riskReviewedAt: null,
        riskReviewedBy: null,
        riskReviewNote: null,
      },
      select: {
        id: true,
        riskReviewedAt: true,
        riskReviewedBy: true,
        riskReviewNote: true,
      },
    });
  }
}

/**
 * Stable JSON serializer with sorted object keys. Postgres jsonb collapses
 * duplicate keys and preserves insertion order, but trainers using different
 * clients may emit the same logical answer set with different orderings —
 * this normalizes them so TEMPLATE_ANSWERS doesn't miss the duplicate.
 */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
