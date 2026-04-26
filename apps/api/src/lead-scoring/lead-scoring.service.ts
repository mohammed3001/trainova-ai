import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LEAD_SCORING_WEIGHTS,
  levelForScore,
  type LeadScore,
  type LeadScoreFactor,
  type ScoredApplication,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tier 9.J — predictive lead scoring service.
 *
 * Computes a 0..100 hire-likelihood score per application by combining six
 * orthogonal signals (skill fit, trainer trust, hire history, application
 * quality, rate alignment, responsiveness). Each signal is normalized to
 * 0..100 in isolation, then combined under the weights in
 * `LEAD_SCORING_WEIGHTS` (kept in `@trainova/shared` so weights can be
 * adjusted without redeploying clients).
 *
 * No model training required — heuristic features are durable, cheap to
 * compute (single Prisma round-trip per application) and explainable to the
 * advertiser via the `factors[]` rationale list.
 */
@Injectable()
export class LeadScoringService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Score one application by id. Caller must own (company-owner / member)
   * the request, otherwise 403.
   */
  async scoreApplication(applicationId: string, userId: string): Promise<LeadScore> {
    const view = await this.loadApplicationView(applicationId);
    if (!view) throw new NotFoundException('Application not found');
    await this.assertReadable(view, userId);

    return this.scoreFromView(view);
  }

  /**
   * Score every application on a request, sorted desc by score. Used by
   * the company shortlist UI to surface "most likely to hire" leads.
   */
  async scoreRequestApplications(
    requestId: string,
    userId: string,
    opts: { limit: number; minScore?: number },
  ): Promise<ScoredApplication[]> {
    const job = await this.prisma.jobRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        company: {
          select: {
            ownerId: true,
            members: { where: { userId }, select: { id: true } },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('Job request not found');
    const isOwner = job.company.ownerId === userId;
    const isMember = job.company.members.length > 0;
    if (!isOwner && !isMember) {
      throw new ForbiddenException('Not part of the owning company');
    }

    const apps = await this.prisma.application.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
      // Higher than the response cap so we score the full inbox once and
      // can trim/filter in-process by `minScore` deterministically.
      take: 200,
    });

    const views = await Promise.all(
      apps.map((a) => this.loadApplicationView(a.id, /* skipAuthLoad */ true)),
    );

    const rows: ScoredApplication[] = [];
    for (const view of views) {
      if (!view) continue;
      const lead = this.scoreFromView(view);
      if (opts.minScore !== undefined && lead.score < opts.minScore) continue;
      rows.push({
        applicationId: view.application.id,
        trainerId: view.application.trainerId,
        trainerName: view.trainer.name,
        status: view.application.status,
        matchScore: view.application.matchScore,
        proposedRate: view.application.proposedRate,
        createdAt: view.application.createdAt.toISOString(),
        lead,
      });
    }
    rows.sort((a, b) => b.lead.score - a.lead.score);
    return rows.slice(0, opts.limit);
  }

  // =====================================================================
  // Scoring core
  // =====================================================================

  private scoreFromView(view: ApplicationView): LeadScore {
    const factors: LeadScoreFactor[] = [
      this.skillMatchFactor(view),
      this.trustFactor(view),
      this.historyFactor(view),
      this.applicationFactor(view),
      this.rateAlignmentFactor(view),
      this.responsivenessFactor(view),
    ];
    // Weighted linear combination — weights sum to 1 by construction.
    const raw = Math.round(
      factors.reduce((acc, f) => acc + f.score * f.weight, 0),
    );
    // Clamp once and derive `level` from the same value so a future weights
    // change (or float drift on the boundary) can't produce a row whose
    // `score` says 100 but whose `level` was computed from 105.
    const score = clamp(raw, 0, 100);
    return {
      applicationId: view.application.id,
      score,
      level: levelForScore(score),
      factors,
      computedAt: new Date().toISOString(),
    };
  }

  private skillMatchFactor(view: ApplicationView): LeadScoreFactor {
    // Use the precomputed `matchScore` if set (Tier 5.D matching service),
    // otherwise derive from skill-set overlap. Either way, this represents
    // raw fit between the trainer's skill graph and the request's skills.
    const matchScore = view.application.matchScore;
    let score: number;
    let reason: string;
    if (matchScore !== null && matchScore !== undefined) {
      score = clamp(matchScore, 0, 100);
      reason = `AI match score ${score.toFixed(0)}%`;
    } else {
      const required = new Set(view.requestSkillIds);
      const trainer = new Set(view.trainerSkillIds);
      if (required.size === 0) {
        score = 50;
        reason = 'Request lists no required skills';
      } else {
        let hit = 0;
        required.forEach((id) => {
          if (trainer.has(id)) hit += 1;
        });
        score = (hit / required.size) * 100;
        reason = `Skill overlap ${hit}/${required.size}`;
      }
    }
    return {
      key: 'skillMatch',
      weight: LEAD_SCORING_WEIGHTS.skillMatch,
      score,
      reason,
    };
  }

  private trustFactor(view: ApplicationView): LeadScoreFactor {
    // Combines email-verified status, profile verification, KYC if present,
    // and account age. Each is bounded so that no single signal can swamp
    // the other trust components.
    let score = 0;
    const reasons: string[] = [];
    if (view.user.emailVerifiedAt) {
      score += 25;
      reasons.push('email verified');
    }
    if (view.profile?.verified) {
      score += 35;
      reasons.push('profile verified');
    }
    if (view.profile?.linkedinUrl || view.profile?.githubUrl) {
      score += 10;
      reasons.push('linked socials');
    }
    // Account age: 0 → 0pts, 30d → ~12pts, 365d → 15pts (capped).
    const ageDays =
      (Date.now() - view.user.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const ageScore = Math.min(15, Math.log1p(ageDays) * 3);
    score += ageScore;
    if (ageDays >= 30) reasons.push(`${Math.round(ageDays)}d account age`);
    return {
      key: 'trust',
      weight: LEAD_SCORING_WEIGHTS.trust,
      score: clamp(score, 0, 100),
      reason: reasons.length > 0 ? reasons.join(', ') : 'No trust signals',
    };
  }

  private historyFactor(view: ApplicationView): LeadScoreFactor {
    // Past acceptance rate over completed applications — i.e. applications
    // whose status has reached a terminal outcome (ACCEPTED, REJECTED,
    // WITHDRAWN, or OFFERED-but-not-accepted). In-flight statuses (APPLIED,
    // SHORTLISTED, TEST_ASSIGNED, TEST_SUBMITTED, INTERVIEW) are excluded so
    // an active applicant doesn't pollute their own historical signal.
    // ACCEPTED counts as a positive outcome; the other terminals count as 0.
    const total = view.history.completed;
    const accepted = view.history.accepted;
    if (total === 0) {
      // No history: prior of 50 (don't penalize new trainers, don't reward
      // them). The trust / skillMatch factors still differentiate.
      return {
        key: 'history',
        weight: LEAD_SCORING_WEIGHTS.history,
        score: 50,
        reason: 'No completed applications yet',
      };
    }
    const rate = accepted / total;
    // Smoothed estimate to avoid 100% on sample-of-1: pull toward 50% prior
    // with strength 3 so a trainer with 1 hire / 1 application reads as
    // (1 + 1.5) / (1 + 3) = 62.5, not 100.
    const smoothed = (accepted + 1.5) / (total + 3);
    const score = clamp(smoothed * 100, 0, 100);
    return {
      key: 'history',
      weight: LEAD_SCORING_WEIGHTS.history,
      score,
      reason: `${accepted}/${total} past hires (${(rate * 100).toFixed(0)}%)`,
    };
  }

  private applicationFactor(view: ApplicationView): LeadScoreFactor {
    // Application quality — proxied by cover-letter length and answers
    // completeness. A trainer who took the time to write a real cover
    // letter and answer all questions is a higher-intent lead.
    let score = 0;
    const reasons: string[] = [];
    const cover = view.application.coverLetter ?? '';
    if (cover.length >= 50) {
      // Diminishing returns past ~600 chars (a reasonable paragraph).
      score += clamp(50 + Math.log10(cover.length / 50) * 25, 50, 75);
      reasons.push(`${cover.length}-char cover letter`);
    } else if (cover.length > 0) {
      score += 15;
      reasons.push('short cover letter');
    }
    const answers = (view.application.answers ?? {}) as Record<string, unknown>;
    const answeredCount = Object.values(answers).filter(
      (v) => v !== null && v !== undefined && String(v).trim().length > 0,
    ).length;
    if (view.requestQuestionCount > 0) {
      const answerRatio = Math.min(1, answeredCount / view.requestQuestionCount);
      score += answerRatio * 25;
      reasons.push(`${answeredCount}/${view.requestQuestionCount} answers`);
    }
    if (view.application.proposedRate !== null) {
      score += 5;
      reasons.push('proposed rate');
    }
    if (view.attachmentCount > 0) {
      score += 5;
      reasons.push(`${view.attachmentCount} attachments`);
    }
    return {
      key: 'application',
      weight: LEAD_SCORING_WEIGHTS.application,
      score: clamp(score, 0, 100),
      reason: reasons.length > 0 ? reasons.join(', ') : 'Minimal application',
    };
  }

  private rateAlignmentFactor(view: ApplicationView): LeadScoreFactor {
    // How well the proposed rate fits inside the request's stated budget
    // band. Inside band → 100. Outside → linearly penalize by overshoot
    // ratio. No proposed rate or no budget → neutral 50.
    const proposed = view.application.proposedRate;
    const min = view.request.budgetMin;
    const max = view.request.budgetMax;
    if (proposed === null) {
      return {
        key: 'rateAlignment',
        weight: LEAD_SCORING_WEIGHTS.rateAlignment,
        score: 50,
        reason: 'No proposed rate',
      };
    }
    if (min === null && max === null) {
      return {
        key: 'rateAlignment',
        weight: LEAD_SCORING_WEIGHTS.rateAlignment,
        score: 50,
        reason: 'Open budget',
      };
    }
    const lo = min ?? 0;
    const hi = max ?? Number.POSITIVE_INFINITY;
    if (proposed >= lo && proposed <= hi) {
      return {
        key: 'rateAlignment',
        weight: LEAD_SCORING_WEIGHTS.rateAlignment,
        score: 100,
        reason: `Rate ${proposed} fits budget`,
      };
    }
    if (proposed < lo) {
      // Under-bidding is mildly positive (cheap) but below 50% of floor
      // looks like a bait price — penalize then.
      const ratio = proposed / Math.max(lo, 1);
      const score = ratio < 0.5 ? 30 : 70;
      return {
        key: 'rateAlignment',
        weight: LEAD_SCORING_WEIGHTS.rateAlignment,
        score,
        reason: `Rate ${proposed} below budget min ${lo}`,
      };
    }
    // proposed > hi: linear penalty by overshoot ratio.
    const overshoot = (proposed - hi) / Math.max(hi, 1);
    const score = clamp(80 - overshoot * 100, 0, 80);
    return {
      key: 'rateAlignment',
      weight: LEAD_SCORING_WEIGHTS.rateAlignment,
      score,
      reason: `Rate ${proposed} above budget max ${hi}`,
    };
  }

  private responsivenessFactor(view: ApplicationView): LeadScoreFactor {
    // Hours from request publication to application submission, capped at
    // 14 days. Faster = more eager trainer = higher signal.
    const publishedAt = view.request.publishedAt ?? view.request.createdAt;
    const responseHours =
      (view.application.createdAt.getTime() - publishedAt.getTime()) /
      (60 * 60 * 1000);
    if (responseHours <= 0) {
      // Application predates publishedAt — likely the request was re-opened
      // or the field is null. Fall back to neutral.
      return {
        key: 'responsiveness',
        weight: LEAD_SCORING_WEIGHTS.responsiveness,
        score: 50,
        reason: 'Response time unknown',
      };
    }
    if (responseHours <= 24) {
      return {
        key: 'responsiveness',
        weight: LEAD_SCORING_WEIGHTS.responsiveness,
        score: 100,
        reason: `Applied in ${responseHours.toFixed(1)}h`,
      };
    }
    if (responseHours <= 24 * 7) {
      return {
        key: 'responsiveness',
        weight: LEAD_SCORING_WEIGHTS.responsiveness,
        score: 70,
        reason: `Applied in ${(responseHours / 24).toFixed(1)}d`,
      };
    }
    if (responseHours <= 24 * 14) {
      return {
        key: 'responsiveness',
        weight: LEAD_SCORING_WEIGHTS.responsiveness,
        score: 40,
        reason: `Applied in ${(responseHours / 24).toFixed(0)}d`,
      };
    }
    return {
      key: 'responsiveness',
      weight: LEAD_SCORING_WEIGHTS.responsiveness,
      score: 20,
      reason: `Applied after ${(responseHours / 24).toFixed(0)}d`,
    };
  }

  // =====================================================================
  // Loaders
  // =====================================================================

  private async loadApplicationView(
    applicationId: string,
    skipAuthLoad = false,
  ): Promise<ApplicationView | null> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        request: {
          include: {
            skills: { select: { skillId: true } },
            questions: { select: { id: true } },
            company: skipAuthLoad
              ? false
              : {
                  select: {
                    ownerId: true,
                    members: { select: { userId: true } },
                  },
                },
          },
        },
        trainer: {
          include: {
            trainerProfile: {
              include: {
                skills: { select: { skillId: true } },
                assets: { select: { id: true } },
              },
            },
          },
        },
        attachments: { select: { id: true } },
      },
    });
    if (!application) return null;

    // Hire history excludes the current application so a single-shot view
    // of a brand-new lead doesn't get its own "no history" rolled into the
    // history factor twice.
    const [completedTotal, completedAccepted] = await Promise.all([
      this.prisma.application.count({
        where: {
          trainerId: application.trainerId,
          status: { in: ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'OFFERED'] },
          NOT: { id: application.id },
        },
      }),
      this.prisma.application.count({
        where: {
          trainerId: application.trainerId,
          status: 'ACCEPTED',
          NOT: { id: application.id },
        },
      }),
    ]);

    return {
      application,
      user: application.trainer,
      profile: application.trainer.trainerProfile,
      trainer: { name: application.trainer.name },
      request: application.request,
      requestSkillIds: application.request.skills.map((s) => s.skillId),
      requestQuestionCount: application.request.questions.length,
      trainerSkillIds:
        application.trainer.trainerProfile?.skills.map((s) => s.skillId) ?? [],
      attachmentCount: application.attachments.length,
      history: { completed: completedTotal, accepted: completedAccepted },
    };
  }

  private async assertReadable(view: ApplicationView, userId: string): Promise<void> {
    // Trainer can read their own scores; otherwise must be the request's
    // company owner / member.
    if (view.application.trainerId === userId) return;
    const company = await this.prisma.company.findUnique({
      where: { id: view.request.companyId },
      select: {
        ownerId: true,
        members: { where: { userId }, select: { id: true } },
      },
    });
    if (!company) throw new ForbiddenException('Forbidden');
    const isOwner = company.ownerId === userId;
    const isMember = company.members.length > 0;
    if (!isOwner && !isMember) {
      throw new ForbiddenException('Not part of the owning company');
    }
  }
}

interface ApplicationView {
  application: {
    id: string;
    trainerId: string;
    status: string;
    coverLetter: string | null;
    proposedRate: number | null;
    matchScore: number | null;
    answers: unknown;
    createdAt: Date;
  };
  user: {
    createdAt: Date;
    emailVerifiedAt: Date | null;
  };
  profile: {
    verified: boolean;
    linkedinUrl: string | null;
    githubUrl: string | null;
  } | null;
  trainer: { name: string };
  request: {
    companyId: string;
    publishedAt: Date | null;
    createdAt: Date;
    budgetMin: number | null;
    budgetMax: number | null;
  };
  requestSkillIds: string[];
  requestQuestionCount: number;
  trainerSkillIds: string[];
  attachmentCount: number;
  history: { completed: number; accepted: number };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
