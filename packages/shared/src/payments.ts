import { z } from 'zod';

export const CONTRACT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const MILESTONE_STATUSES = [
  'PENDING',
  'FUNDED',
  'RELEASED',
  'REFUNDED',
  'CANCELLED',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const PAYMENT_INTENT_STATUSES = [
  'REQUIRES_PAYMENT_METHOD',
  'REQUIRES_CONFIRMATION',
  'REQUIRES_ACTION',
  'PROCESSING',
  'REQUIRES_CAPTURE',
  'SUCCEEDED',
  'CANCELED',
  'FAILED',
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYOUT_STATUSES = [
  'PENDING',
  'IN_TRANSIT',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const STRIPE_CONNECT_STATUSES = [
  'NONE',
  'PENDING',
  'ACTIVE',
  'RESTRICTED',
] as const;
export type StripeConnectStatus = (typeof STRIPE_CONNECT_STATUSES)[number];

/**
 * ISO-4217 currency codes supported by the escrow/billing stack.
 * Scoped intentionally — Stripe supports more but we surface only the
 * ones the admin has configured in `Setting.key = "billing.currencies"`.
 */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const MIN_MILESTONE_CENTS = 100; // $1 minimum (Stripe will reject lower)
const MAX_MILESTONE_CENTS = 50_000_000; // $500,000 hard cap per milestone

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  amountCents: z
    .number()
    .int()
    .min(MIN_MILESTONE_CENTS)
    .max(MAX_MILESTONE_CENTS),
  dueDate: z.string().datetime().optional(),
});
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

export const createContractInputSchema = z.object({
  applicationId: z.string().cuid(),
  title: z.string().trim().min(4).max(200),
  description: z.string().trim().max(10_000).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  platformFeeBps: z.number().int().min(0).max(5000).optional(),
  milestones: z.array(milestoneInputSchema).min(1).max(20),
});
export type CreateContractInput = z.infer<typeof createContractInputSchema>;

export const updateContractInputSchema = z.object({
  title: z.string().trim().min(4).max(200).optional(),
  description: z.string().trim().max(10_000).optional(),
});
export type UpdateContractInput = z.infer<typeof updateContractInputSchema>;

export const fundMilestoneInputSchema = z.object({
  /** Stripe PaymentMethod id (pm_...) returned by the client-side Elements flow. */
  paymentMethodId: z.string().trim().min(3).max(200),
  returnUrl: z.string().url().optional(),
  /** T7.E — optional coupon code applied to this milestone funding. */
  couponCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,40}$/)
    .optional(),
});
export type FundMilestoneInput = z.infer<typeof fundMilestoneInputSchema>;

export const releaseMilestoneInputSchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
  })
  .default({});
export type ReleaseMilestoneInput = z.infer<typeof releaseMilestoneInputSchema>;

export const refundMilestoneInputSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type RefundMilestoneInput = z.infer<typeof refundMilestoneInputSchema>;

export const subscribePlanInputSchema = z.object({
  planId: z.string().cuid(),
  paymentMethodId: z.string().trim().min(3).max(200).optional(),
  /** T7.E — optional coupon code applied to this subscription. */
  couponCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,40}$/)
    .optional(),
});
export type SubscribePlanInput = z.infer<typeof subscribePlanInputSchema>;

// ---------- Public DTOs (wire shape) ----------

export interface PublicMilestone {
  id: string;
  contractId: string;
  title: string;
  description: string | null;
  /** Gross amount charged to the buyer (subtotal + tax). */
  amountCents: number;
  /** Tax-exclusive subtotal portion of `amountCents`. Defaults to `amountCents` on pre-T6.C milestones. */
  subtotalCents: number;
  /** Tax portion of `amountCents`. Zero for reverse-charge / export / pre-T6.C. */
  taxAmountCents: number;
  order: number;
  dueDate: string | null;
  status: MilestoneStatus;
  fundedAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
}

export interface PublicContract {
  id: string;
  applicationId: string;
  companyId: string;
  trainerId: string;
  title: string;
  description: string | null;
  currency: string;
  /** Gross total (subtotal + tax). */
  totalAmountCents: number;
  /** Tax-exclusive subtotal. */
  subtotalAmountCents: number;
  /** Basis points, 1500 = 15%. */
  taxRateBps: number;
  /** Tax portion of `totalAmountCents`. */
  taxAmountCents: number;
  /** Jurisdiction label (e.g. "VAT", "GST"). Null when no tax applies. */
  taxLabel: string | null;
  /** Free-text legal note rendered on invoices (reverse charge / export clause). */
  taxNote: string | null;
  /** True when the buyer must self-account for the tax (zero-rated invoice with note). */
  reverseCharge: boolean;
  platformFeeBps: number;
  status: ContractStatus;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  milestones: PublicMilestone[];
  company?: { id: string; name: string; slug: string; logoUrl: string | null };
  trainer?: { id: string; name: string; avatarUrl: string | null };
}

export interface PublicStripeConnectAccount {
  id: string;
  stripeAccountId: string;
  status: StripeConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
  lastSyncedAt: string | null;
}

export interface PublicPayout {
  id: string;
  milestoneId: string | null;
  /** Net amount hitting the trainer's Connect account (gross − fee). */
  amountCents: number;
  /** Original milestone gross before any deductions. Zero on pre-T6.C payouts. */
  grossAmountCents: number;
  /** Platform service fee withheld. Zero on pre-T6.C payouts. */
  feeAmountCents: number;
  /** Tax portion of the original milestone (informational only on self-billing statement). */
  taxAmountCents: number;
  currency: string;
  status: PayoutStatus;
  stripeTransferId: string | null;
  stripePayoutId: string | null;
  failureMessage: string | null;
  arrivedAt: string | null;
  createdAt: string;
}

/**
 * Summary of trainer earnings returned by `GET /payments/earnings`.
 * All amounts are in cents in the trainer's payout currency.
 */
export interface TrainerEarningsSummary {
  currency: string;
  pendingCents: number; // contracts funded but not yet released
  availableCents: number; // released minus paid out
  paidOutCents: number;
  totalEarnedCents: number;
}
