import { z } from 'zod';

/**
 * Tier 9.J — Predictive lead scoring for applications.
 *
 * Given an application from a trainer to a company's job request, predict
 * the probability that the trainer will reach `ACCEPTED` (i.e. be hired).
 * Output is normalized to 0..100 with a coarse tier label so company owners
 * can sort their inbox by "most likely to hire" without surfacing the raw
 * model internals.
 *
 * Distinct from Tier 9.D (fraud) which scores *risk*: this scores *fit*.
 * The two are orthogonal — a high-fit applicant can still trip a fraud
 * signal, and a clean applicant can still be a low-fit lead.
 */

export const leadScoreLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type LeadScoreLevel = z.infer<typeof leadScoreLevelSchema>;

export const leadScoreFactorSchema = z.object({
  key: z.string(),
  /** Component contribution to the final score in [0, 100]. */
  score: z.number().min(0).max(100),
  /** Weight in the linear combination (0..1, sum across factors === 1). */
  weight: z.number().min(0).max(1),
  /** Short, advertiser-facing rationale (e.g. "Past acceptance rate 60%"). */
  reason: z.string(),
});
export type LeadScoreFactor = z.infer<typeof leadScoreFactorSchema>;

export const leadScoreSchema = z.object({
  applicationId: z.string(),
  score: z.number().min(0).max(100),
  level: leadScoreLevelSchema,
  factors: z.array(leadScoreFactorSchema),
  computedAt: z.string(),
});
export type LeadScore = z.infer<typeof leadScoreSchema>;

export const scoredApplicationSchema = z.object({
  applicationId: z.string(),
  trainerId: z.string(),
  trainerName: z.string(),
  status: z.string(),
  matchScore: z.number().nullable(),
  proposedRate: z.number().int().nullable(),
  createdAt: z.string(),
  lead: leadScoreSchema,
});
export type ScoredApplication = z.infer<typeof scoredApplicationSchema>;

export const leadScoringQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  minScore: z.coerce.number().min(0).max(100).optional(),
});
export type LeadScoringQuery = z.infer<typeof leadScoringQuerySchema>;

/**
 * Component weights (must sum to 1). Calibrated against the intuition that
 * trainer trust and skill fit dominate hiring decisions, with past hire
 * history acting as a tie-breaker.
 *
 * Adjust these here, *not* in the service — keeping weights in shared
 * keeps the contract testable from any consumer.
 */
export const LEAD_SCORING_WEIGHTS = {
  skillMatch: 0.3,
  trust: 0.2,
  history: 0.2,
  application: 0.15,
  rateAlignment: 0.1,
  responsiveness: 0.05,
} as const;

export const LEAD_SCORE_TIER_BOUNDARIES = {
  high: 70,
  medium: 40,
} as const;

export function levelForScore(score: number): LeadScoreLevel {
  if (score >= LEAD_SCORE_TIER_BOUNDARIES.high) return 'HIGH';
  if (score >= LEAD_SCORE_TIER_BOUNDARIES.medium) return 'MEDIUM';
  return 'LOW';
}
