import { z } from 'zod';

/**
 * Outbound webhook event types. Mirrors `WebhookEventType` in
 * `packages/db/prisma/schema.prisma` — keep these in sync. We export
 * the enum as a const tuple so we can derive both the Zod schema and
 * a TS string-literal union from the same source.
 */
export const WEBHOOK_EVENT_TYPES = [
  'APPLICATION_CREATED',
  'APPLICATION_STATUS_CHANGED',
  'APPLICATION_HIRED',
  'CONTRACT_CREATED',
  'CONTRACT_COMPLETED',
  'MILESTONE_RELEASED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_CANCELLED',
] as const;

export const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

/**
 * Wire envelope shipped to the subscriber on every delivery. The
 * server signs the *raw JSON-stringified body* with HMAC-SHA256 over
 * the webhook's `secret`, and ships:
 *   X-Trainova-Event:     event type
 *   X-Trainova-Delivery:  delivery row id (idempotency key)
 *   X-Trainova-Signature: `t=<unix>,v1=<hex hmac>`  (Stripe-style;
 *     subscribers should reject if `|now-t| > 300s` after verifying
 *     the HMAC, to defeat replay attacks).
 */
export interface WebhookEnvelope<T = unknown> {
  /** Stable id of the *delivery* row (not the source entity). Use as
   *  the idempotency key on the subscriber side. */
  id: string;
  eventType: WebhookEventType;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** Schema version for `data`. Bump on breaking changes. */
  version: 1;
  data: T;
}

// --- Public-facing payload shapes (what subscribers receive) ---

export interface WebhookApplicationPayload {
  applicationId: string;
  jobRequestId: string;
  trainerId: string;
  companyId: string;
  status: string;
  /** Set on `APPLICATION_STATUS_CHANGED` only. */
  previousStatus?: string;
  /** Set on `APPLICATION_HIRED` only. */
  hiredAt?: string;
}

export interface WebhookContractPayload {
  contractId: string;
  companyId: string;
  trainerId: string;
  status: string;
  totalMinor: number;
  currency: string;
  /** Set on `CONTRACT_COMPLETED` only. */
  completedAt?: string;
}

export interface WebhookMilestonePayload {
  milestoneId: string;
  contractId: string;
  amountMinor: number;
  currency: string;
  releasedAt: string;
}

export interface WebhookInterviewPayload {
  interviewId: string;
  conversationId: string;
  trainerId: string;
  scheduledById: string;
  scheduledAt: string;
  durationMin: number;
  /** Set on `INTERVIEW_CANCELLED` only. */
  cancelReason?: string;
}

// --- Admin-side schemas (the company-owner's create/update form) ---

const URL_RE = /^https:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * Webhook URL must be HTTPS. We deliberately reject `http://` even
 * for `localhost` — subscribers run on their own infra, and the
 * signature scheme only protects the body, not the transport. If
 * someone wants to test locally they can use ngrok/cloudflared.
 */
const webhookUrlSchema = z
  .string()
  .max(2048)
  .regex(URL_RE, 'must be an https:// URL');

export const CreateWebhookSchema = z.object({
  url: webhookUrlSchema,
  events: z.array(WebhookEventTypeSchema).max(WEBHOOK_EVENT_TYPES.length).default([]),
  description: z.string().trim().max(200).optional(),
});
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = z.object({
  url: webhookUrlSchema.optional(),
  events: z.array(WebhookEventTypeSchema).max(WEBHOOK_EVENT_TYPES.length).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;

export const ListWebhookDeliveriesQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'IN_FLIGHT', 'SUCCEEDED', 'FAILED', 'ABANDONED'])
    .optional(),
  /** ISO-8601 UTC cursor; returns deliveries strictly *older* than it. */
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListWebhookDeliveriesQuery = z.infer<typeof ListWebhookDeliveriesQuerySchema>;
