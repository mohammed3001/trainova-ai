import { z } from 'zod';

/**
 * Feature-based AI matching contract used by:
 *  - Trainer dashboard "Recommended jobs" feed
 *  - Company request "Suggested trainers" panel
 *  - Admin matching dashboard
 *
 * Scores are normalized to 0..100. Each component breakdown is also returned
 * so the UI can show "why this match" reasoning to admins/companies.
 */

export const matchingScoreBreakdownSchema = z.object({
  skills: z.object({
    score: z.number().min(0).max(100),
    matchedSkillIds: z.array(z.string()),
    missingSkillIds: z.array(z.string()),
    requiredSatisfied: z.boolean(),
  }),
  languages: z.object({
    score: z.number().min(0).max(100),
    matched: z.array(z.string()),
  }),
  rate: z.object({
    score: z.number().min(0).max(100),
    fits: z.boolean(),
  }),
  trust: z.object({
    score: z.number().min(0).max(100),
    verified: z.boolean(),
    portfolioCount: z.number().int().nonnegative(),
  }),
  history: z.object({
    score: z.number().min(0).max(100),
    pastApplications: z.number().int().nonnegative(),
    acceptedApplications: z.number().int().nonnegative(),
  }),
});
export type MatchingScoreBreakdown = z.infer<typeof matchingScoreBreakdownSchema>;

export const trainerMatchSchema = z.object({
  trainerId: z.string(),
  trainerName: z.string(),
  trainerEmail: z.string(),
  slug: z.string().nullable(),
  headline: z.string().nullable(),
  country: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  hourlyRateMin: z.number().int().nullable(),
  hourlyRateMax: z.number().int().nullable(),
  currency: z.string().default('USD'),
  score: z.number().min(0).max(100),
  breakdown: matchingScoreBreakdownSchema,
});
export type TrainerMatch = z.infer<typeof trainerMatchSchema>;

export const jobMatchSchema = z.object({
  jobRequestId: z.string(),
  slug: z.string(),
  title: z.string(),
  companyName: z.string(),
  industry: z.string().nullable(),
  workType: z.string(),
  budgetMin: z.number().int().nullable(),
  budgetMax: z.number().int().nullable(),
  currency: z.string().default('USD'),
  publishedAt: z.string().nullable(),
  score: z.number().min(0).max(100),
  breakdown: matchingScoreBreakdownSchema,
});
export type JobMatch = z.infer<typeof jobMatchSchema>;

export const matchingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  minScore: z.coerce.number().min(0).max(100).optional(),
});
export type MatchingQuery = z.infer<typeof matchingQuerySchema>;

/**
 * Component weights (must sum to 100). Tuned so that a verified trainer with
 * full skill coverage and matching languages always tops a generic match.
 */
export const MATCHING_WEIGHTS = {
  skills: 50,
  languages: 15,
  rate: 15,
  trust: 10,
  history: 10,
} as const;
