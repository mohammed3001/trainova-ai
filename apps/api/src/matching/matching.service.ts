import { Injectable } from '@nestjs/common';
import {
  MATCHING_WEIGHTS,
  SPONSORED_WEIGHT_MAX,
  type JobMatch,
  type MatchingScoreBreakdown,
  type TrainerMatch,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SponsoredService } from '../sponsored/sponsored.service';

interface TrainerView {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  profile: {
    id: string;
    slug: string;
    headline: string | null;
    country: string | null;
    languages: string[];
    hourlyRateMin: number | null;
    hourlyRateMax: number | null;
    verified: boolean;
    skills: { skillId: string; yearsExperience: number | null }[];
    portfolioCount: number;
  };
  history: { total: number; accepted: number };
}

interface JobView {
  id: string;
  slug: string;
  title: string;
  industry: string | null;
  workType: string;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  publishedAt: Date | null;
  languages: string[];
  companyName: string;
  skills: { skillId: string; required: boolean; minYears: number | null }[];
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sponsored: SponsoredService,
  ) {}

  // =====================================================================
  // Public entrypoints
  // =====================================================================

  /**
   * Top trainers for a given OPEN job request, scored by skill / language /
   * rate / trust / history. Sorted desc by score, ties broken by verified,
   * then by hourlyRateMin asc (cheaper wins ties).
   */
  async recommendTrainersForJob(
    jobRequestId: string,
    opts: { limit: number; minScore?: number },
  ): Promise<TrainerMatch[]> {
    const job = await this.loadJobView(jobRequestId);
    if (!job) return [];

    // Pull a candidate pool: trainers whose profile shares at least one skill
    // with the request OR who match a request language. We then re-score the
    // pool in-process. We cap the pool to keep cold-path latency bounded.
    const trainers = await this.candidateTrainersForJob(job, 200);
    // T7.G — load active sponsorship boosts for the trainer pool in one
    // round trip so per-row scoring stays O(1).
    const boostMap = await this.sponsored.getActiveBoostMap('TRAINER');

    const scored: TrainerMatch[] = trainers
      .map((t) => {
        const baseBreakdown = this.scoreTrainerAgainstJob(t, job);
        const boost = boostMap.get(t.profile.id) ?? 0;
        const breakdown = this.applySponsorBoost(baseBreakdown, boost);
        const score = this.combine(breakdown);
        return {
          trainerId: t.userId,
          trainerName: t.name,
          trainerEmail: t.email,
          slug: t.profile.slug,
          headline: t.profile.headline,
          country: t.profile.country,
          avatarUrl: t.avatarUrl,
          hourlyRateMin: t.profile.hourlyRateMin,
          hourlyRateMax: t.profile.hourlyRateMax,
          currency: job.currency,
          score,
          sponsored: boost > 0,
          breakdown,
        } satisfies TrainerMatch;
      })
      .filter((m) => (opts.minScore ? m.score >= opts.minScore : true))
      .sort((a, b) => {
        // Score is primary so a low-quality sponsored match can never beat a
        // high-quality unsponsored one — applySponsorBoost has already added
        // the (capped) sponsor weight into score. Sponsored only acts as a
        // tiebreaker at exactly equal score.
        if (b.score !== a.score) return b.score - a.score;
        if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
        if (a.breakdown.trust.verified !== b.breakdown.trust.verified) {
          return a.breakdown.trust.verified ? -1 : 1;
        }
        const ar = a.hourlyRateMin ?? Number.POSITIVE_INFINITY;
        const br = b.hourlyRateMin ?? Number.POSITIVE_INFINITY;
        return ar - br;
      });

    return scored.slice(0, opts.limit);
  }

  /**
   * Top OPEN job requests for a given trainer.
   */
  async recommendJobsForTrainer(
    userId: string,
    opts: { limit: number; minScore?: number },
  ): Promise<JobMatch[]> {
    const trainer = await this.loadTrainerView(userId);
    if (!trainer) return [];

    const jobs = await this.candidateJobsForTrainer(trainer, 200);
    const boostMap = await this.sponsored.getActiveBoostMap('JOB_REQUEST');

    const scored: JobMatch[] = jobs
      .map((j) => {
        const baseBreakdown = this.scoreTrainerAgainstJob(trainer, j);
        const boost = boostMap.get(j.id) ?? 0;
        const breakdown = this.applySponsorBoost(baseBreakdown, boost);
        const score = this.combine(breakdown);
        return {
          jobRequestId: j.id,
          slug: j.slug,
          title: j.title,
          companyName: j.companyName,
          industry: j.industry,
          workType: j.workType,
          budgetMin: j.budgetMin,
          budgetMax: j.budgetMax,
          currency: j.currency,
          publishedAt: j.publishedAt?.toISOString() ?? null,
          score,
          sponsored: boost > 0,
          breakdown,
        } satisfies JobMatch;
      })
      .filter((m) => (opts.minScore ? m.score >= opts.minScore : true))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
        return 0;
      });

    return scored.slice(0, opts.limit);
  }

  // =====================================================================
  // Scoring
  // =====================================================================

  private scoreTrainerAgainstJob(
    trainer: TrainerView,
    job: JobView,
  ): MatchingScoreBreakdown {
    // ---- Skills (50%) ------------------------------------------------------
    const trainerSkillIds = new Map(
      trainer.profile.skills.map((s) => [s.skillId, s.yearsExperience ?? 0]),
    );
    const jobSkillIds = job.skills.map((s) => s.skillId);
    const requiredSkills = job.skills.filter((s) => s.required);
    const matchedSkillIds: string[] = [];
    const missingSkillIds: string[] = [];

    let weightedHit = 0;
    let weightedTotal = 0;
    for (const js of job.skills) {
      const weight = js.required ? 2 : 1;
      weightedTotal += weight;
      const trainerYears = trainerSkillIds.get(js.skillId);
      if (trainerYears === undefined) {
        missingSkillIds.push(js.skillId);
        continue;
      }
      // Skill is present; partial credit if minYears not satisfied
      if (js.minYears && trainerYears < js.minYears) {
        const ratio = trainerYears / js.minYears;
        weightedHit += weight * Math.max(0.4, ratio);
      } else {
        weightedHit += weight;
      }
      matchedSkillIds.push(js.skillId);
    }

    const skillsScore = jobSkillIds.length === 0 ? 60 : Math.round((weightedHit / weightedTotal) * 100);
    const requiredSatisfied =
      requiredSkills.length === 0 ||
      requiredSkills.every((rs) => trainerSkillIds.has(rs.skillId));

    // ---- Languages (15%) ---------------------------------------------------
    const jobLangs = new Set(job.languages.map((l) => l.toLowerCase()));
    const matchedLangs = trainer.profile.languages.filter((l) =>
      jobLangs.has(l.toLowerCase()),
    );
    // Trainer language arrays may contain case-variant duplicates (e.g.
    // ['en', 'EN']) which would inflate the matched count past the deduped
    // jobLangs Set size. Clamp to 100 so the breakdown bar never overflows.
    const langsScore =
      jobLangs.size === 0
        ? 50
        : Math.min(100, Math.round((matchedLangs.length / jobLangs.size) * 100));

    // ---- Rate fit (15%) ----------------------------------------------------
    const rateScore = this.scoreRateFit(trainer, job);
    const rateFits = rateScore >= 70;

    // ---- Trust (10%) -------------------------------------------------------
    let trustScore = 40;
    if (trainer.profile.verified) trustScore += 40;
    trustScore += Math.min(20, trainer.profile.portfolioCount * 5);
    if (trustScore > 100) trustScore = 100;

    // ---- History (10%) -----------------------------------------------------
    const historyScore = this.scoreHistory(trainer);

    return {
      skills: { score: skillsScore, matchedSkillIds, missingSkillIds, requiredSatisfied },
      languages: { score: langsScore, matched: matchedLangs },
      rate: { score: rateScore, fits: rateFits },
      trust: {
        score: trustScore,
        verified: trainer.profile.verified,
        portfolioCount: trainer.profile.portfolioCount,
      },
      history: {
        score: historyScore,
        pastApplications: trainer.history.total,
        acceptedApplications: trainer.history.accepted,
      },
      // Default sponsor block — `applySponsorBoost` sets the real values
      // when the row is in the boost map. Keeps `MatchingScoreBreakdown`
      // total here so callers don't have to merge two shapes.
      sponsor: { score: 0, boost: 0, active: false },
    };
  }

  /**
   * Returns a fresh breakdown with the sponsor signal populated. The
   * boost itself is added on top of the weighted score in `combine()`,
   * which lets the existing component weights stay 100%.
   */
  private applySponsorBoost(
    breakdown: MatchingScoreBreakdown,
    boost: number,
  ): MatchingScoreBreakdown {
    const safe = Math.max(0, Math.min(SPONSORED_WEIGHT_MAX, Math.round(boost)));
    if (safe === 0) return breakdown;
    return {
      ...breakdown,
      sponsor: {
        score: Math.min(100, safe * 2),
        boost: safe,
        active: true,
      },
    };
  }

  private scoreRateFit(trainer: TrainerView, job: JobView): number {
    const tMin = trainer.profile.hourlyRateMin;
    const tMax = trainer.profile.hourlyRateMax;
    const bMin = job.budgetMin;
    const bMax = job.budgetMax;
    if (tMin === null && tMax === null) return 60;
    if (bMin === null && bMax === null) return 70;

    const trainerLo = tMin ?? tMax ?? 0;
    const trainerHi = tMax ?? tMin ?? trainerLo;
    const budgetLo = bMin ?? bMax ?? 0;
    const budgetHi = bMax ?? bMin ?? budgetLo;

    // Full overlap → 100, partial → linear, no overlap → distance penalty.
    if (trainerHi <= budgetHi && trainerLo >= budgetLo) return 100;
    if (trainerLo > budgetHi) {
      const gap = trainerLo - budgetHi;
      const denom = budgetHi || 1;
      return Math.max(0, Math.round(100 - (gap / denom) * 100));
    }
    if (trainerHi < budgetLo) {
      // Trainer cheaper than min budget → still positive but capped (company may be over-budgeting)
      return 70;
    }
    // Partial overlap: measure how much of trainer's range intersects budget
    const overlapLo = Math.max(trainerLo, budgetLo);
    const overlapHi = Math.min(trainerHi, budgetHi);
    const overlap = Math.max(0, overlapHi - overlapLo);
    const trainerSpan = Math.max(1, trainerHi - trainerLo);
    return Math.min(95, Math.round(40 + (overlap / trainerSpan) * 60));
  }

  private scoreHistory(trainer: TrainerView): number {
    if (trainer.history.total === 0) return 50;
    const acceptanceRate = trainer.history.accepted / trainer.history.total;
    const volumeBonus = Math.min(30, trainer.history.total * 3);
    return Math.min(100, Math.round(40 + acceptanceRate * 30 + volumeBonus));
  }

  private combine(b: MatchingScoreBreakdown): number {
    const w = MATCHING_WEIGHTS;
    const weighted =
      (b.skills.score * w.skills +
        b.languages.score * w.languages +
        b.rate.score * w.rate +
        b.trust.score * w.trust +
        b.history.score * w.history) /
      100;
    // Sponsor boost is additive and capped, so a paid placement can
    // raise but never replace the underlying match quality. The
    // `sponsored` flag on the match row is what actually drives the
    // "Sponsored" badge and the tiebreak.
    const total = weighted + b.sponsor.boost;
    return Math.round(Math.max(0, Math.min(100, total)));
  }

  // =====================================================================
  // Loaders
  // =====================================================================

  private async loadTrainerView(userId: string): Promise<TrainerView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        trainerProfile: {
          select: {
            id: true,
            slug: true,
            headline: true,
            country: true,
            languages: true,
            hourlyRateMin: true,
            hourlyRateMax: true,
            verified: true,
            skills: { select: { skillId: true, yearsExperience: true } },
            assets: {
              where: { kind: 'portfolio', deletedAt: null },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!user || !user.trainerProfile) return null;

    const [total, accepted] = await Promise.all([
      this.prisma.application.count({ where: { trainerId: userId } }),
      this.prisma.application.count({
        where: { trainerId: userId, status: 'ACCEPTED' },
      }),
    ]);

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      profile: {
        id: user.trainerProfile.id,
        slug: user.trainerProfile.slug,
        headline: user.trainerProfile.headline,
        country: user.trainerProfile.country,
        languages: user.trainerProfile.languages,
        hourlyRateMin: user.trainerProfile.hourlyRateMin,
        hourlyRateMax: user.trainerProfile.hourlyRateMax,
        verified: user.trainerProfile.verified,
        skills: user.trainerProfile.skills,
        portfolioCount: user.trainerProfile.assets.length,
      },
      history: { total, accepted },
    };
  }

  private async loadJobView(id: string): Promise<JobView | null> {
    const job = await this.prisma.jobRequest.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        industry: true,
        workType: true,
        budgetMin: true,
        budgetMax: true,
        currency: true,
        publishedAt: true,
        languages: true,
        company: { select: { name: true } },
        skills: { select: { skillId: true, required: true, minYears: true } },
      },
    });
    if (!job) return null;
    return {
      id: job.id,
      slug: job.slug,
      title: job.title,
      industry: job.industry,
      workType: job.workType,
      budgetMin: job.budgetMin,
      budgetMax: job.budgetMax,
      currency: job.currency,
      publishedAt: job.publishedAt,
      languages: job.languages,
      companyName: job.company.name,
      skills: job.skills,
    };
  }

  private async candidateTrainersForJob(job: JobView, cap: number): Promise<TrainerView[]> {
    const skillIds = job.skills.map((s) => s.skillId);
    // Build the OR clauses conditionally so a request with neither required
    // skills nor required languages still recalls the freshest active
    // trainers (mirrors candidateJobsForTrainer).
    const orConditions: import('@trainova/db').Prisma.TrainerProfileWhereInput[] = [];
    if (skillIds.length)
      orConditions.push({ skills: { some: { skillId: { in: skillIds } } } });
    if (job.languages.length)
      orConditions.push({ languages: { hasSome: job.languages } });

    const profiles = await this.prisma.trainerProfile.findMany({
      where: {
        user: { status: 'ACTIVE' },
        ...(orConditions.length ? { OR: orConditions } : {}),
      },
      take: cap,
      orderBy: [
        { sponsoredUntil: { sort: 'desc', nulls: 'last' } },
        { verified: 'desc' },
        { updatedAt: 'desc' },
      ],
      select: {
        id: true,
        slug: true,
        headline: true,
        country: true,
        languages: true,
        hourlyRateMin: true,
        hourlyRateMax: true,
        verified: true,
        skills: { select: { skillId: true, yearsExperience: true } },
        assets: {
          where: { kind: 'portfolio', deletedAt: null },
          select: { id: true },
        },
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true, status: true },
        },
      },
    });
    if (profiles.length === 0) return [];

    const userIds = profiles.map((p) => p.user.id);
    const historyRows = await this.prisma.application.groupBy({
      by: ['trainerId', 'status'],
      where: { trainerId: { in: userIds } },
      _count: { _all: true },
    });
    const historyByUser = new Map<string, { total: number; accepted: number }>();
    for (const id of userIds) historyByUser.set(id, { total: 0, accepted: 0 });
    for (const row of historyRows) {
      const h = historyByUser.get(row.trainerId);
      if (!h) continue;
      h.total += row._count._all;
      if (row.status === 'ACCEPTED') h.accepted += row._count._all;
    }

    return profiles.map((p) => ({
      userId: p.user.id,
      name: p.user.name,
      email: p.user.email,
      avatarUrl: p.user.avatarUrl,
      profile: {
        id: p.id,
        slug: p.slug,
        headline: p.headline,
        country: p.country,
        languages: p.languages,
        hourlyRateMin: p.hourlyRateMin,
        hourlyRateMax: p.hourlyRateMax,
        verified: p.verified,
        skills: p.skills,
        portfolioCount: p.assets.length,
      },
      history: historyByUser.get(p.user.id) ?? { total: 0, accepted: 0 },
    }));
  }

  private async candidateJobsForTrainer(trainer: TrainerView, cap: number): Promise<JobView[]> {
    const skillIds = trainer.profile.skills.map((s) => s.skillId);
    const orConditions: import('@trainova/db').Prisma.JobRequestWhereInput[] = [];
    if (skillIds.length) orConditions.push({ skills: { some: { skillId: { in: skillIds } } } });
    if (trainer.profile.languages.length)
      orConditions.push({ languages: { hasSome: trainer.profile.languages } });

    const rows = await this.prisma.jobRequest.findMany({
      where: {
        status: 'OPEN',
        ...(orConditions.length ? { OR: orConditions } : {}),
      },
      take: cap,
      orderBy: [
        { sponsoredUntil: { sort: 'desc', nulls: 'last' } },
        { featured: 'desc' },
        { publishedAt: 'desc' },
      ],
      select: {
        id: true,
        slug: true,
        title: true,
        industry: true,
        workType: true,
        budgetMin: true,
        budgetMax: true,
        currency: true,
        publishedAt: true,
        languages: true,
        company: { select: { name: true } },
        skills: { select: { skillId: true, required: true, minYears: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      industry: r.industry,
      workType: r.workType,
      budgetMin: r.budgetMin,
      budgetMax: r.budgetMax,
      currency: r.currency,
      publishedAt: r.publishedAt,
      languages: r.languages,
      companyName: r.company.name,
      skills: r.skills,
    }));
  }
}
