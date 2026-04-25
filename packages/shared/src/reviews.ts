import { z } from 'zod';

/**
 * T5.E — Reviews + Disputes shared contracts.
 *
 * Reviews are tied to a `Contract` (one per author per contract) so the UI
 * can show "Verified contract review" provenance. Free-form reviews without
 * a contract are still permitted at the schema level for legacy entries.
 */

export const reviewRatingSchema = z.number().int().min(1).max(5);

export const submitReviewInputSchema = z.object({
  contractId: z.string().min(1),
  rating: reviewRatingSchema,
  comment: z.string().trim().min(0).max(2000).optional(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export interface ReviewListItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  contractId: string | null;
  contractTitle: string | null;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    role: 'COMPANY' | 'TRAINER';
  };
}

export interface ReviewSummary {
  count: number;
  averageRating: number; // 0–5, 1 decimal
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

// ---------- Disputes ----------

export const DisputeStatuses = [
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED_FOR_TRAINER',
  'RESOLVED_FOR_COMPANY',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type DisputeStatus = (typeof DisputeStatuses)[number];

export const DisputePartyRoles = ['COMPANY', 'TRAINER'] as const;
export type DisputePartyRole = (typeof DisputePartyRoles)[number];

export const DISPUTE_ACTIVE_STATUSES = ['OPEN', 'UNDER_REVIEW'] as const;
export const DISPUTE_TERMINAL_STATUSES = [
  'RESOLVED_FOR_TRAINER',
  'RESOLVED_FOR_COMPANY',
  'REJECTED',
  'WITHDRAWN',
] as const;

const disputeReasons = [
  'PAYMENT_NOT_RELEASED',
  'WORK_NOT_DELIVERED',
  'QUALITY_ISSUE',
  'COMMUNICATION_BREAKDOWN',
  'SCOPE_DISAGREEMENT',
  'OTHER',
] as const;
export const DisputeReasons = disputeReasons;
export type DisputeReason = (typeof disputeReasons)[number];

export const raiseDisputeInputSchema = z.object({
  contractId: z.string().min(1),
  reason: z.enum(disputeReasons),
  description: z.string().trim().min(10).max(4000),
  evidence: z
    .object({
      attachmentIds: z.array(z.string().min(1)).max(20).optional(),
      // `z.string().url()` accepts `javascript:` and `data:` URLs (anything
      // `new URL()` parses). The dispute detail UIs render these as
      // clickable `<a target="_blank">` links, so a malicious party could
      // craft an evidence link that runs script in an admin's browser.
      // Restrict to http(s) only.
      links: z
        .array(
          z
            .string()
            .url()
            .max(500)
            .refine((u) => /^https?:\/\//i.test(u), {
              message: 'Only http/https links are allowed',
            }),
        )
        .max(10)
        .optional(),
    })
    .optional(),
});
export type RaiseDisputeInput = z.infer<typeof raiseDisputeInputSchema>;

export const disputeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(DisputeStatuses).optional(),
});
export type DisputeListQuery = z.infer<typeof disputeListQuerySchema>;

const adminTransitionStatuses = [
  'UNDER_REVIEW',
  'RESOLVED_FOR_TRAINER',
  'RESOLVED_FOR_COMPANY',
  'REJECTED',
] as const;
export type DisputeAdminTransition = (typeof adminTransitionStatuses)[number];

export const adminDisputeUpdateSchema = z.object({
  status: z.enum(adminTransitionStatuses),
  resolution: z.string().trim().min(0).max(4000).optional(),
});
export type AdminDisputeUpdateInput = z.infer<typeof adminDisputeUpdateSchema>;

/**
 * Allowed transitions enforced by the service layer. Once a dispute is in a
 * terminal state it cannot be re-opened — the raiser must file a new dispute.
 */
export const DISPUTE_TRANSITIONS: Record<DisputeStatus, readonly DisputeStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED_FOR_TRAINER', 'RESOLVED_FOR_COMPANY', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['RESOLVED_FOR_TRAINER', 'RESOLVED_FOR_COMPANY', 'REJECTED'],
  RESOLVED_FOR_TRAINER: [],
  RESOLVED_FOR_COMPANY: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function canTransitionDispute(
  from: DisputeStatus,
  to: DisputeStatus,
): boolean {
  if (from === to) return false;
  return DISPUTE_TRANSITIONS[from].includes(to);
}

export interface DisputeEvidence {
  attachmentIds?: string[];
  links?: string[];
}

export interface DisputeListItem {
  id: string;
  status: DisputeStatus;
  reason: DisputeReason;
  description: string;
  evidence: DisputeEvidence | null;
  raisedByRole: DisputePartyRole;
  raisedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  contract: {
    id: string;
    title: string;
    companyName: string;
    trainerName: string;
  };
  raisedBy: {
    id: string;
    displayName: string;
  };
  resolver: {
    id: string;
    displayName: string;
  } | null;
}
