import { z } from 'zod';

/**
 * Sponsored placements (Tier 7.G).
 *
 * Two surfaces use the same model:
 *   - **TRAINER** placements boost a `TrainerProfile` in trainer-search
 *     ordering and in `MatchingService.recommendTrainersForJob`.
 *   - **JOB_REQUEST** placements boost an open `JobRequest` in the public
 *     request listing and in `MatchingService.recommendJobsForTrainer`.
 *
 * Sponsorship is **additive** — it never replaces organic relevance. The
 * server clamps the per-placement weight to `[1, 50]` so a low-quality
 * match can't outrank a high-quality unsponsored one by more than half
 * the 0..100 scale. Result lists also tag boosted entries with a
 * "Sponsored" badge so users see why a row is elevated.
 */

export const sponsoredKindSchema = z.enum(['TRAINER', 'JOB_REQUEST']);
export type SponsoredKind = z.infer<typeof sponsoredKindSchema>;

export const sponsoredStatusSchema = z.enum([
  'DRAFT',
  'PENDING_PAYMENT',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'REJECTED',
]);
export type SponsoredStatus = z.infer<typeof sponsoredStatusSchema>;

export const sponsoredSourceSchema = z.enum(['ADMIN', 'SELF_PAID']);
export type SponsoredSource = z.infer<typeof sponsoredSourceSchema>;

/** Per-placement boost weight bounds, enforced server-side. */
export const SPONSORED_WEIGHT_MIN = 1;
export const SPONSORED_WEIGHT_MAX = 50;
export const SPONSORED_WEIGHT_DEFAULT = 20;

/** Self-paid placement pricing — flat USD-cents per day, configurable
 *  via env. Kept centralised so admin UI and Stripe checkout agree. */
export const SPONSORED_PRICE_PER_DAY_CENTS = 500;
/** Hard ceiling on a single self-paid placement window. Beyond this the
 *  buyer must transact directly with sales — keeps the CSRF / billing
 *  blast radius bounded. */
export const SPONSORED_MAX_DAYS_SELF_PAID = 90;

const isoDateString = z
  .string()
  .datetime({ offset: true, message: 'Invalid ISO 8601 datetime' });

/** Admin grant payload — no money changes hands. */
export const adminCreateSponsoredSchema = z
  .object({
    kind: sponsoredKindSchema,
    trainerProfileId: z.string().min(1).optional(),
    jobRequestId: z.string().min(1).optional(),
    weight: z
      .number()
      .int()
      .min(SPONSORED_WEIGHT_MIN)
      .max(SPONSORED_WEIGHT_MAX)
      .default(SPONSORED_WEIGHT_DEFAULT),
    startsAt: isoDateString.optional(),
    endsAt: isoDateString,
    notes: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'TRAINER' && !value.trainerProfileId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trainerProfileId'],
        message: 'trainerProfileId is required when kind=TRAINER',
      });
    }
    if (value.kind === 'JOB_REQUEST' && !value.jobRequestId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobRequestId'],
        message: 'jobRequestId is required when kind=JOB_REQUEST',
      });
    }
    if (value.startsAt && new Date(value.startsAt) >= new Date(value.endsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'endsAt must be strictly after startsAt',
      });
    }
  });
export type AdminCreateSponsoredInput = z.infer<typeof adminCreateSponsoredSchema>;

export const adminUpdateSponsoredSchema = z
  .object({
    weight: z.number().int().min(SPONSORED_WEIGHT_MIN).max(SPONSORED_WEIGHT_MAX).optional(),
    status: sponsoredStatusSchema.optional(),
    endsAt: isoDateString.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type AdminUpdateSponsoredInput = z.infer<typeof adminUpdateSponsoredSchema>;

export const adminListSponsoredQuerySchema = z.object({
  kind: sponsoredKindSchema.optional(),
  status: sponsoredStatusSchema.optional(),
  source: sponsoredSourceSchema.optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AdminListSponsoredQuery = z.infer<typeof adminListSponsoredQuerySchema>;

/** Self-paid checkout — owner picks a duration in whole days. */
export const selfPaidCheckoutBaseSchema = z.object({
  kind: sponsoredKindSchema,
  trainerProfileId: z.string().min(1).optional(),
  jobRequestId: z.string().min(1).optional(),
  days: z.number().int().min(1).max(SPONSORED_MAX_DAYS_SELF_PAID),
});

const selfPaidCheckoutInvariants = (
  value: { kind: SponsoredKind; trainerProfileId?: string; jobRequestId?: string },
  ctx: z.RefinementCtx,
) => {
  if (value.kind === 'TRAINER' && !value.trainerProfileId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['trainerProfileId'],
      message: 'trainerProfileId is required when kind=TRAINER',
    });
  }
  if (value.kind === 'JOB_REQUEST' && !value.jobRequestId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['jobRequestId'],
      message: 'jobRequestId is required when kind=JOB_REQUEST',
    });
  }
};

export const selfPaidCheckoutSchema =
  selfPaidCheckoutBaseSchema.superRefine(selfPaidCheckoutInvariants);
export type SelfPaidCheckoutInput = z.infer<typeof selfPaidCheckoutSchema>;

/** Body schema for `POST /sponsored/checkout` — base + paymentMethodId. */
export const selfPaidCheckoutBodySchema = selfPaidCheckoutBaseSchema
  .extend({ paymentMethodId: z.string().min(1) })
  .superRefine(selfPaidCheckoutInvariants);
export type SelfPaidCheckoutBody = z.infer<typeof selfPaidCheckoutBodySchema>;

/** Server response for the admin grid — flat fields the UI renders. */
export const sponsoredPlacementSchema = z.object({
  id: z.string(),
  kind: sponsoredKindSchema,
  trainerProfileId: z.string().nullable(),
  jobRequestId: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  source: sponsoredSourceSchema,
  status: sponsoredStatusSchema,
  weight: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
  pricedCents: z.number().int(),
  currency: z.string(),
  stripePaymentIntentId: z.string().nullable(),
  notes: z.string().nullable(),
  /** Display label resolved server-side: trainer slug or job-request title. */
  subjectLabel: z.string(),
  /** Public slug so the admin grid can deep-link to the public surface. */
  subjectSlug: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SponsoredPlacementDTO = z.infer<typeof sponsoredPlacementSchema>;

export const sponsoredPlacementListSchema = z.object({
  items: z.array(sponsoredPlacementSchema),
  total: z.number().int().nonnegative(),
});
export type SponsoredPlacementList = z.infer<typeof sponsoredPlacementListSchema>;

/** Returned by self-paid checkout — drives the Stripe Elements flow. */
export const selfPaidCheckoutResponseSchema = z.object({
  placementId: z.string(),
  clientSecret: z.string(),
  publishableKey: z.string(),
  pricedCents: z.number().int().nonnegative(),
  currency: z.string(),
});
export type SelfPaidCheckoutResponse = z.infer<typeof selfPaidCheckoutResponseSchema>;
