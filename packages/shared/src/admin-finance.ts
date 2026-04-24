import { z } from 'zod';
import {
  CONTRACT_STATUSES,
  MILESTONE_STATUSES,
  PAYOUT_STATUSES,
  SUPPORTED_CURRENCIES,
  type ContractStatus,
  type MilestoneStatus,
  type PayoutStatus,
} from './payments';

/**
 * Audit actions emitted by admin-side finance operations. Used both as
 * AuditLog.action strings and to filter the admin history feed.
 */
export const FINANCE_AUDIT_ACTIONS = {
  ADMIN_REFUND_MILESTONE: 'ADMIN_REFUND_MILESTONE',
  ADMIN_RELEASE_MILESTONE: 'ADMIN_RELEASE_MILESTONE',
  ADMIN_RETRY_PAYOUT: 'ADMIN_RETRY_PAYOUT',
  ADMIN_CANCEL_PAYOUT: 'ADMIN_CANCEL_PAYOUT',
  ADMIN_CANCEL_SUBSCRIPTION: 'ADMIN_CANCEL_SUBSCRIPTION',
  ADMIN_PLAN_CREATED: 'ADMIN_PLAN_CREATED',
  ADMIN_PLAN_UPDATED: 'ADMIN_PLAN_UPDATED',
  ADMIN_PLAN_DELETED: 'ADMIN_PLAN_DELETED',
} as const;
export type FinanceAuditAction =
  (typeof FINANCE_AUDIT_ACTIONS)[keyof typeof FINANCE_AUDIT_ACTIONS];

export const PLAN_AUDIENCES = ['COMPANY', 'TRAINER'] as const;
export type PlanAudience = (typeof PLAN_AUDIENCES)[number];

// ---------- Filters / inputs ----------

export const adminContractsQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminContractsQuery = z.infer<typeof adminContractsQuery>;

export const adminPayoutsQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(PAYOUT_STATUSES).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminPayoutsQuery = z.infer<typeof adminPayoutsQuery>;

export const adminSubscriptionsQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().min(1).max(40).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminSubscriptionsQuery = z.infer<typeof adminSubscriptionsQuery>;

export const adminRefundMilestoneInput = z.object({
  reason: z.string().trim().min(3).max(1000),
});
export type AdminRefundMilestoneInput = z.infer<typeof adminRefundMilestoneInput>;

export const adminCancelSubscriptionInput = z.object({
  reason: z.string().trim().max(1000).optional(),
  immediate: z.boolean().default(false),
});
export type AdminCancelSubscriptionInput = z.infer<typeof adminCancelSubscriptionInput>;

export const adminPlanInput = z.object({
  audience: z.enum(PLAN_AUDIENCES),
  tier: z.string().trim().min(2).max(40),
  priceMonthly: z.number().int().min(0).max(1_000_000_00),
  priceYearly: z.number().int().min(0).max(12_000_000_00),
  featuresJson: z.unknown(),
  stripePriceId: z.string().trim().max(120).optional(),
});
export type AdminPlanInput = z.infer<typeof adminPlanInput>;

export const adminPlanUpdateInput = adminPlanInput.partial();
export type AdminPlanUpdateInput = z.infer<typeof adminPlanUpdateInput>;

// ---------- Public DTOs ----------

export interface AdminFinanceOverview {
  totals: {
    contractsActive: number;
    contractsCompleted: number;
    escrowHeldCents: number; // sum(milestones FUNDED)
    releasedCents: number; // sum(milestones RELEASED)
    refundedCents: number; // sum(milestones REFUNDED)
    platformFeeCents: number; // sum(contract.platformFee on RELEASED milestones)
    payoutsPaidCents: number;
    payoutsPendingCents: number;
    payoutsFailedCents: number;
    activeSubscriptions: number;
  };
  /** Last 12 months bucketed by ISO YYYY-MM. */
  monthlyRevenue: Array<{
    month: string;
    grossCents: number;
    feeCents: number;
    refundCents: number;
  }>;
  recent: {
    contracts: AdminContractRow[];
    payouts: AdminPayoutRow[];
  };
}

export interface AdminContractRow {
  id: string;
  title: string;
  status: ContractStatus;
  currency: string;
  totalAmountCents: number;
  platformFeeBps: number;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  company: { id: string; name: string; slug: string };
  trainer: { id: string; name: string; email: string };
  milestoneSummary: {
    total: number;
    funded: number;
    released: number;
    refunded: number;
  };
}

export interface AdminContractDetail extends AdminContractRow {
  description: string | null;
  applicationId: string;
  milestones: Array<{
    id: string;
    title: string;
    description: string | null;
    amountCents: number;
    order: number;
    dueDate: string | null;
    status: MilestoneStatus;
    fundedAt: string | null;
    releasedAt: string | null;
    refundedAt: string | null;
    paymentIntents: Array<{
      id: string;
      stripePaymentIntentId: string;
      amountCents: number;
      status: string;
      receiptUrl: string | null;
      failureMessage: string | null;
      createdAt: string;
    }>;
    payouts: Array<{
      id: string;
      amountCents: number;
      status: PayoutStatus;
      stripeTransferId: string | null;
      stripePayoutId: string | null;
      arrivedAt: string | null;
      failureMessage: string | null;
      createdAt: string;
    }>;
  }>;
}

export interface AdminPayoutRow {
  id: string;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  stripeTransferId: string | null;
  stripePayoutId: string | null;
  failureMessage: string | null;
  arrivedAt: string | null;
  createdAt: string;
  trainer: { id: string; name: string; email: string };
  milestone: {
    id: string;
    title: string;
    contractId: string;
    contractTitle: string;
  } | null;
}

export interface AdminSubscriptionRow {
  id: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string; role: string };
  plan: { id: string; tier: string; audience: PlanAudience };
}

export interface AdminPlanRow {
  id: string;
  audience: PlanAudience;
  tier: string;
  priceMonthly: number;
  priceYearly: number;
  featuresJson: unknown;
  stripePriceId: string | null;
  createdAt: string;
  subscriptionsCount: number;
}

export const SUPPORTED_CURRENCY_OPTIONS = SUPPORTED_CURRENCIES;
