import { z } from 'zod';

/**
 * T7.E — Coupons & Promotions.
 *
 * A coupon is a code that, when applied at checkout, reduces the amount
 * the buyer pays. Two scopes are supported:
 *
 *   1. SUBSCRIPTION — when subscribing to a `Plan`. We pass the coupon's
 *      `stripeCouponId` through to Stripe via `subscriptions.create`'s
 *      `coupon` parameter so Stripe applies the discount on the recurring
 *      invoice. Coupons without a `stripeCouponId` cannot be applied to
 *      subscriptions (the admin must mirror the coupon to Stripe first).
 *
 *   2. MILESTONE — when funding an escrow milestone. We compute the
 *      discount in-process and reduce the `PaymentIntent.amount` we ask
 *      Stripe to charge; the trainer still receives the full milestone
 *      amount minus the platform fee, and the discount is absorbed by
 *      the platform (this is the standard "platform-funded promo" model).
 *
 * Discount math:
 *   - PERCENT  → amountOff is in basis points (1..10000); discount =
 *                floor(original * bps / 10000).
 *   - FIXED    → amountOff is in minor units (cents); currency must
 *                match the order currency.
 *
 * `maxDiscountMinor` caps PERCENT coupons (e.g. "50% off up to $50").
 * `minAmountMinor` rejects orders below a threshold (e.g. "$10 off
 * orders ≥ $100").
 */
export const CouponKinds = ['PERCENT', 'FIXED'] as const;
export type CouponKind = (typeof CouponKinds)[number];

export const CouponStatuses = ['ACTIVE', 'DISABLED'] as const;
export type CouponStatus = (typeof CouponStatuses)[number];

export const CouponAudiences = ['COMPANY', 'TRAINER', 'ANY'] as const;
export type CouponAudience = (typeof CouponAudiences)[number];

export const CouponAppliesTos = ['SUBSCRIPTION', 'MILESTONE', 'ANY'] as const;
export type CouponAppliesTo = (typeof CouponAppliesTos)[number];

export const CouponScopes = ['SUBSCRIPTION', 'MILESTONE'] as const;
export type CouponScope = (typeof CouponScopes)[number];

/** Codes are uppercased + alphanumeric/dash/underscore, 3..40 chars. */
export const COUPON_CODE_REGEX = /^[A-Z0-9_-]{3,40}$/;

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(COUPON_CODE_REGEX, 'Invalid coupon code');

export const createCouponSchema = z
  .object({
    code: couponCodeSchema,
    description: z.string().trim().max(500).optional().nullable(),
    kind: z.enum(CouponKinds),
    amountOff: z.number().int().positive(),
    currency: z.string().length(3).optional().nullable(),
    audience: z.enum(CouponAudiences).default('ANY'),
    appliesTo: z.enum(CouponAppliesTos).default('ANY'),
    planIds: z.array(z.string().cuid()).max(50).default([]),
    minAmountMinor: z.number().int().nonnegative().optional().nullable(),
    maxDiscountMinor: z.number().int().nonnegative().optional().nullable(),
    validFrom: z.string().datetime().optional().nullable(),
    validUntil: z.string().datetime().optional().nullable(),
    maxRedemptions: z.number().int().positive().optional().nullable(),
    perUserLimit: z.number().int().positive().default(1),
    stripeCouponId: z.string().trim().min(1).max(120).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'PERCENT' && (v.amountOff < 1 || v.amountOff > 10_000)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountOff'],
        message: 'PERCENT coupons take basis points (1..10000)',
      });
    }
    if (v.kind === 'FIXED' && !v.currency) {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'currency is required for FIXED coupons',
      });
    }
    if (
      v.validFrom &&
      v.validUntil &&
      new Date(v.validFrom) >= new Date(v.validUntil)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'validUntil must be after validFrom',
      });
    }
  });

export type CreateCouponInput = z.infer<typeof createCouponSchema>;

/**
 * Patch shape — every field is optional. `code` is intentionally NOT
 * editable (would invalidate references in CouponRedemption + admin
 * audit trails).
 */
export const updateCouponSchema = z
  .object({
    description: z.string().trim().max(500).optional().nullable(),
    audience: z.enum(CouponAudiences).optional(),
    appliesTo: z.enum(CouponAppliesTos).optional(),
    planIds: z.array(z.string().cuid()).max(50).optional(),
    minAmountMinor: z.number().int().nonnegative().optional().nullable(),
    maxDiscountMinor: z.number().int().nonnegative().optional().nullable(),
    validFrom: z.string().datetime().optional().nullable(),
    validUntil: z.string().datetime().optional().nullable(),
    maxRedemptions: z.number().int().positive().optional().nullable(),
    perUserLimit: z.number().int().positive().optional(),
    status: z.enum(CouponStatuses).optional(),
    stripeCouponId: z.string().trim().min(1).max(120).optional().nullable(),
  })
  .strict();

export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export const listCouponsQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(CouponStatuses).optional(),
  appliesTo: z.enum(CouponAppliesTos).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;

export const previewCouponSchema = z.object({
  code: couponCodeSchema,
  scope: z.enum(CouponScopes),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  planId: z.string().cuid().optional(),
});
export type PreviewCouponInput = z.infer<typeof previewCouponSchema>;

/** Public DTO returned by admin list/get endpoints. */
export interface PublicCoupon {
  id: string;
  code: string;
  description: string | null;
  kind: CouponKind;
  amountOff: number;
  currency: string | null;
  audience: CouponAudience;
  appliesTo: CouponAppliesTo;
  planIds: string[];
  minAmountMinor: number | null;
  maxDiscountMinor: number | null;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  perUserLimit: number;
  redeemedCount: number;
  totalDiscountMinor: number;
  status: CouponStatus;
  stripeCouponId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CouponPreviewResult {
  code: string;
  kind: CouponKind;
  amountOff: number;
  originalMinor: number;
  discountMinor: number;
  finalMinor: number;
  currency: string;
  description: string | null;
}

/**
 * Pure discount math. Caller is responsible for validity checks (status,
 * window, audience, plan filter, redemption limits) — this only computes
 * the monetary effect. Returns floor() of the percent discount so we
 * never charge buyers a fraction of a cent in their favour we then have
 * to round up away from them.
 */
export function computeCouponDiscount(
  coupon: Pick<
    PublicCoupon,
    'kind' | 'amountOff' | 'currency' | 'maxDiscountMinor' | 'minAmountMinor'
  >,
  originalMinor: number,
  currency: string,
): { applicable: boolean; reason?: string; discountMinor: number; finalMinor: number } {
  if (originalMinor <= 0) {
    return { applicable: false, reason: 'Order amount is zero', discountMinor: 0, finalMinor: 0 };
  }
  if (coupon.minAmountMinor != null && originalMinor < coupon.minAmountMinor) {
    return {
      applicable: false,
      reason: `Order amount must be at least ${coupon.minAmountMinor} (in minor units)`,
      discountMinor: 0,
      finalMinor: originalMinor,
    };
  }
  let discount = 0;
  if (coupon.kind === 'PERCENT') {
    const bps = Math.max(0, Math.min(coupon.amountOff, 10_000));
    discount = Math.floor((originalMinor * bps) / 10_000);
    if (coupon.maxDiscountMinor != null) {
      discount = Math.min(discount, coupon.maxDiscountMinor);
    }
  } else {
    if (!coupon.currency || coupon.currency.toUpperCase() !== currency.toUpperCase()) {
      return {
        applicable: false,
        reason: 'Coupon currency does not match order currency',
        discountMinor: 0,
        finalMinor: originalMinor,
      };
    }
    discount = coupon.amountOff;
  }
  // Never let the discount exceed the order amount (no negative
  // payments). And clamp to 0 just in case of bad config.
  discount = Math.max(0, Math.min(discount, originalMinor));
  return {
    applicable: true,
    discountMinor: discount,
    finalMinor: originalMinor - discount,
  };
}
