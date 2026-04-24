import { z } from 'zod';

export const AD_CAMPAIGN_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'ACTIVE',
  'PAUSED',
  'REJECTED',
  'ENDED',
] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export const AD_PRICING_MODELS = ['CPM', 'CPC', 'FLAT'] as const;
export type AdPricingModel = (typeof AD_PRICING_MODELS)[number];

export const AD_PLACEMENTS = [
  'HOMEPAGE_HERO',
  'SIDEBAR_SEARCH',
  'FEATURED_TRAINER',
  'FEATURED_COMPANY',
  'SEARCH_RESULT',
  'CATEGORY_SPONSOR',
  'NEWSLETTER',
  'NATIVE_LISTING',
] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const AD_CREATIVE_TYPES = [
  'BANNER',
  'SPONSORED_LISTING',
  'FEATURED_TRAINER',
  'CATEGORY_SPONSOR',
  'NATIVE',
] as const;
export type AdCreativeType = (typeof AD_CREATIVE_TYPES)[number];

export const AD_TOPUP_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'] as const;
export type AdTopupStatus = (typeof AD_TOPUP_STATUSES)[number];

// URL accepted for the CTA: https only for landing pages. Relative paths
// are also allowed so advertisers can link to internal pages (e.g.
// `/trainers/foo`).
const urlOrPath = z.string().refine(
  (v) => {
    if (v.startsWith('/')) return v.length > 1 && v.length <= 1024;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && v.length <= 1024;
    } catch {
      return false;
    }
  },
  { message: 'must be https:// or a relative path starting with /' },
);

const optionalUrl = z
  .string()
  .trim()
  .max(1024)
  .refine(
    (v) => {
      if (v === '') return true;
      try {
        const u = new URL(v);
        return u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'must be https://' },
  )
  .optional();

export const createCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    companyId: z.string().cuid().optional(),
    pricingModel: z.enum(AD_PRICING_MODELS).default('CPM'),
    cpmCents: z.number().int().min(1).max(1_000_000).optional(),
    cpcCents: z.number().int().min(1).max(1_000_000).optional(),
    flatFeeCents: z.number().int().min(1).max(100_000_000).optional(),
    targetingCountries: z.array(z.string().length(2)).max(50).default([]),
    targetingLocales: z.array(z.string().min(2).max(8)).max(16).default([]),
    targetingSkillIds: z.array(z.string().cuid()).max(32).default([]),
    frequencyCapPerDay: z.number().int().min(1).max(100).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.pricingModel === 'CPM' && !value.cpmCents) {
      ctx.addIssue({
        code: 'custom',
        path: ['cpmCents'],
        message: 'cpmCents is required for CPM campaigns',
      });
    }
    if (value.pricingModel === 'CPC' && !value.cpcCents) {
      ctx.addIssue({
        code: 'custom',
        path: ['cpcCents'],
        message: 'cpcCents is required for CPC campaigns',
      });
    }
    if (value.pricingModel === 'FLAT' && !value.flatFeeCents) {
      ctx.addIssue({
        code: 'custom',
        path: ['flatFeeCents'],
        message: 'flatFeeCents is required for FLAT campaigns',
      });
    }
    if (value.startDate && value.endDate && value.endDate <= value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'endDate must be after startDate',
      });
    }
  });
export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;

export const updateCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    cpmCents: z.number().int().min(1).max(1_000_000).optional(),
    cpcCents: z.number().int().min(1).max(1_000_000).optional(),
    flatFeeCents: z.number().int().min(1).max(100_000_000).optional(),
    targetingCountries: z.array(z.string().length(2)).max(50).optional(),
    targetingLocales: z.array(z.string().min(2).max(8)).max(16).optional(),
    targetingSkillIds: z.array(z.string().cuid()).max(32).optional(),
    frequencyCapPerDay: z.number().int().min(1).max(100).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate <= value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'endDate must be after startDate',
      });
    }
  });
export type UpdateCampaignInput = z.infer<typeof updateCampaignInputSchema>;

export const createCreativeInputSchema = z.object({
  type: z.enum(AD_CREATIVE_TYPES).default('NATIVE'),
  headline: z.string().trim().min(1).max(120),
  body: z.string().trim().max(400).optional(),
  ctaLabel: z.string().trim().max(32).optional(),
  ctaUrl: urlOrPath,
  assetUrl: optionalUrl,
  placements: z.array(z.enum(AD_PLACEMENTS)).min(1).max(AD_PLACEMENTS.length),
  weight: z.number().int().min(1).max(10).default(1),
  isActive: z.boolean().default(true),
});
export type CreateCreativeInput = z.infer<typeof createCreativeInputSchema>;

export const updateCreativeInputSchema = createCreativeInputSchema.partial();
export type UpdateCreativeInput = z.infer<typeof updateCreativeInputSchema>;

export const topupCampaignInputSchema = z.object({
  amountCents: z.number().int().min(500).max(1_000_000_00),
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(3)
    .default('usd'),
  paymentMethodId: z.string().trim().min(3).max(256),
});
export type TopupCampaignInput = z.infer<typeof topupCampaignInputSchema>;

export const rejectCampaignInputSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectCampaignInput = z.infer<typeof rejectCampaignInputSchema>;

export const serveAdsInputSchema = z.object({
  placement: z.enum(AD_PLACEMENTS),
  locale: z.string().trim().min(2).max(8).optional(),
  country: z.string().trim().length(2).optional(),
  skillIds: z.array(z.string().cuid()).max(8).optional(),
  limit: z.number().int().min(1).max(10).default(1),
});
export type ServeAdsInput = z.infer<typeof serveAdsInputSchema>;

export const impressionInputSchema = z.object({
  creativeId: z.string().cuid(),
  placement: z.enum(AD_PLACEMENTS),
});
export type ImpressionInput = z.infer<typeof impressionInputSchema>;

export interface PublicAdCreative {
  id: string;
  campaignId: string;
  type: AdCreativeType;
  headline: string;
  body: string | null;
  assetUrl: string | null;
  ctaLabel: string | null;
  /**
   * The click endpoint, NOT the raw `ctaUrl`. Clicking this URL logs the
   * click server-side and 302s to the advertiser's destination — the raw
   * destination is never leaked on a page that doesn't render the ad.
   */
  clickUrl: string;
  placements: AdPlacement[];
  /**
   * Marks an ad with the Sponsored label per the transparency requirements
   * documented in `13-product-vision-v2.md`. Currently true for every
   * creative; kept as an explicit boolean so the UI can rely on it.
   */
  sponsored: true;
}

export interface PublicAdCampaign {
  id: string;
  name: string;
  ownerId: string;
  companyId: string | null;
  pricingModel: AdPricingModel;
  cpmCents: number | null;
  cpcCents: number | null;
  flatFeeCents: number | null;
  budgetCents: number;
  spentCents: number;
  status: AdCampaignStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  targetingCountries: string[];
  targetingLocales: string[];
  targetingSkillIds: string[];
  frequencyCapPerDay: number | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  creatives: PublicAdCreative[];
  /** Counts of served + clicked across all creatives; cheap rollup. */
  totals: {
    impressions: number;
    clicks: number;
  };
}

/**
 * Extended view for the campaign's owner / admins. Exposes fields that
 * are NEVER sent to end users: raw ctaUrl (destination URL), weight,
 * isActive, running counts, admin review metadata. Safe to attach to
 * `/ads/campaigns/mine`, `/ads/campaigns/:id`, and `/admin/ads/*`.
 */
export interface OwnerAdCreative {
  id: string;
  campaignId: string;
  type: AdCreativeType;
  headline: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string;
  assetUrl: string | null;
  placements: AdPlacement[];
  weight: number;
  isActive: boolean;
  impressionCount: number;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerAdCampaign extends Omit<PublicAdCampaign, 'creatives'> {
  reviewedById: string | null;
  creatives: OwnerAdCreative[];
}

export interface AdminAdCampaign extends OwnerAdCampaign {
  owner: { id: string; name: string; email: string } | null;
  company: { id: string; slug: string; name: string } | null;
}

export interface AdTopupSummary {
  id: string;
  amountCents: number;
  currency: string;
  status: AdTopupStatus;
  createdAt: string;
}

export interface StartAdTopupResponse {
  topupId: string;
  clientSecret: string;
  publishableKey: string;
}
