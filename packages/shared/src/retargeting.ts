import { z } from 'zod';

/**
 * Retargeting + audience segments (Tier 9.G).
 *
 * The platform tracks visitor behaviour via an HTML pixel and an explicit
 * JSON event endpoint, materialises behavioural cohorts into
 * `AudienceMembership` rows on a cron, then exposes those segments as a
 * targeting facet on `AdCampaign.targetingAudienceSegmentIds`. Ad serving
 * intersects the requesting session's segment set with each campaign's
 * targeted set; an empty target list disables audience targeting and
 * makes the creative eligible for any session.
 *
 * Privacy stance:
 *   - We never store raw IP addresses. Only a sha256-truncated hash.
 *   - Tracking cookies are first-party only; we don't share them with
 *     any third-party network. Users can clear them like any cookie.
 *   - Membership rows TTL out at `addedAt + segment.lookbackDays` so a
 *     dormant cookie naturally drops out of segments.
 */

// =====================================================================
// Event ingestion
// =====================================================================

/**
 * Cookie name set on the pixel endpoint when no cookie is present.
 * Same name on web and api so first-party `Set-Cookie` works across
 * both `apps/web` (next-intl middleware) and `apps/api` responses.
 */
export const RETARGETING_COOKIE_NAME = '_tr_visit';

/**
 * Server-side max for the auto-set tracking cookie (90 days). The
 * pixel's `Max-Age` header is computed from this value.
 */
export const RETARGETING_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/**
 * Truncation cap for the `path` field. Longer paths are sliced before
 * insert so a runaway client can't fill the events table with multi-KB
 * URL fragments.
 */
export const RETARGETING_PATH_MAX = 512;

/** Truncation cap for the user-agent field. */
export const RETARGETING_UA_MAX = 256;

export const retargetingEventTypeSchema = z.enum([
  'PAGE_VIEW',
  'TRAINER_VIEW',
  'REQUEST_VIEW',
  'COMPANY_VIEW',
  'APPLICATION_START',
  'CHECKOUT_START',
  'CHECKOUT_ABANDON',
  'CHECKOUT_COMPLETE',
  'SEARCH',
  'CUSTOM',
]);
export type RetargetingEventType = z.infer<typeof retargetingEventTypeSchema>;

export const retargetingEntityKindSchema = z.enum([
  'TRAINER',
  'REQUEST',
  'COMPANY',
  'CONTRACT',
  'TEST',
  'OTHER',
]);
export type RetargetingEntityKind = z.infer<typeof retargetingEntityKindSchema>;

/**
 * Body schema for `POST /retargeting/event`. The pixel endpoint accepts
 * a similar but query-string variant; both go through the same service
 * after parsing.
 */
export const retargetingEventInputSchema = z.object({
  eventType: retargetingEventTypeSchema,
  path: z.string().trim().max(RETARGETING_PATH_MAX).optional(),
  entityKind: retargetingEntityKindSchema.optional(),
  entityId: z.string().trim().min(1).max(64).optional(),
  locale: z.string().trim().min(2).max(8).optional(),
});
export type RetargetingEventInput = z.infer<typeof retargetingEventInputSchema>;

// =====================================================================
// Segment definition (admin authoring)
// =====================================================================

/**
 * A single rule in a segment definition. The recomputer treats rules as
 * a logical OR — a session enters a segment if it matches any rule.
 * Within a rule, all fields are AND'd together (event type AND optional
 * entityKind AND optional entityId AND withinDays).
 */
export const retargetingSegmentRuleSchema = z.object({
  eventType: retargetingEventTypeSchema,
  entityKind: retargetingEntityKindSchema.optional(),
  /**
   * Optional fixed entity match (e.g. "viewed trainer X"). When set,
   * `entityKind` must also be set.
   */
  entityId: z.string().trim().min(1).max(64).optional(),
  /**
   * Window the event must fall within, relative to the recompute pass.
   * Capped at the segment's `lookbackDays` at recompute time.
   */
  withinDays: z.coerce.number().int().min(1).max(180).default(30),
  /**
   * Minimum number of matching events required for this rule to fire.
   * Useful for "viewed >= 3 trainers in last 7 days" cohorts. Defaults
   * to 1 (any single matching event).
   */
  minCount: z.coerce.number().int().min(1).max(1000).default(1),
});
export type RetargetingSegmentRule = z.infer<
  typeof retargetingSegmentRuleSchema
>;

export const retargetingSegmentDefinitionSchema = z.object({
  rules: z
    .array(retargetingSegmentRuleSchema)
    .min(1, 'segment must have at least one rule')
    .max(20, 'segment supports up to 20 rules'),
});
export type RetargetingSegmentDefinition = z.infer<
  typeof retargetingSegmentDefinitionSchema
>;

// =====================================================================
// Admin CRUD
// =====================================================================

const SEGMENT_SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
export const SEGMENT_SLUG_MIN = 3;
export const SEGMENT_SLUG_MAX = 64;
export const SEGMENT_LOOKBACK_MIN = 1;
export const SEGMENT_LOOKBACK_MAX = 180;

export const audienceSegmentCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(SEGMENT_SLUG_MIN)
    .max(SEGMENT_SLUG_MAX)
    .regex(SEGMENT_SLUG_REGEX, {
      message:
        'slug must be lower-kebab (a-z, 0-9, -), start with a letter, end with letter/digit',
    }),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  lookbackDays: z.coerce
    .number()
    .int()
    .min(SEGMENT_LOOKBACK_MIN)
    .max(SEGMENT_LOOKBACK_MAX)
    .default(30),
  isActive: z.boolean().optional().default(true),
  definition: retargetingSegmentDefinitionSchema,
});
export type AudienceSegmentCreateInput = z.infer<
  typeof audienceSegmentCreateSchema
>;

export const audienceSegmentUpdateSchema = audienceSegmentCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field is required',
  });
export type AudienceSegmentUpdateInput = z.infer<
  typeof audienceSegmentUpdateSchema
>;

// =====================================================================
// Public DTOs
// =====================================================================

export interface AudienceSegmentSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  lookbackDays: number;
  isActive: boolean;
  recomputedAt: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceSegmentDetail extends AudienceSegmentSummary {
  definition: RetargetingSegmentDefinition;
  createdById: string;
}

export interface RetargetingEventSummary {
  id: string;
  cookieId: string;
  userId: string | null;
  eventType: RetargetingEventType;
  path: string | null;
  entityKind: RetargetingEntityKind | null;
  entityId: string | null;
  createdAt: string;
}
