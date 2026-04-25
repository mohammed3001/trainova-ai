import { z } from 'zod';
import { Locales } from './enums';
import { UserRoles, UserStatuses } from './enums';

/**
 * Status of an admin-authored marketing campaign. The cron worker only
 * picks up rows in `SCHEDULED` whose `scheduledFor <= now`. Manually
 * triggered sends transition `DRAFT -> SENDING -> SENT` directly.
 */
export const EmailCampaignStatuses = [
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'CANCELLED',
  'FAILED',
] as const;
export type EmailCampaignStatus = (typeof EmailCampaignStatuses)[number];

export const EmailCampaignKinds = ['BROADCAST'] as const;
export type EmailCampaignKind = (typeof EmailCampaignKinds)[number];

export const EmailCampaignSendStatuses = [
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
] as const;
export type EmailCampaignSendStatus = (typeof EmailCampaignSendStatuses)[number];

export const EmailDripTriggers = [
  'USER_REGISTERED',
  'TRAINER_PROFILE_INCOMPLETE',
  'COMPANY_FIRST_REQUEST_PENDING',
  'MANUAL',
] as const;
export type EmailDripTrigger = (typeof EmailDripTriggers)[number];

/**
 * Structured segment filter. Each clause narrows the recipient set.
 * Empty (`{}`) means "all active users with verified emails", which is the
 * safest default. Locale, role, status are AND-ed; createdAfter/Before is
 * a half-open range on `User.createdAt`.
 */
export const EmailSegmentSchema = z
  .object({
    roles: z.array(z.enum(UserRoles)).max(8).optional(),
    statuses: z.array(z.enum(UserStatuses)).max(8).optional(),
    locales: z.array(z.enum(Locales)).max(4).optional(),
    onlyVerified: z.boolean().optional().default(true),
    createdAfter: z
      .string()
      .datetime()
      .optional()
      .describe('ISO-8601 — include users registered at or after this instant.'),
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe('ISO-8601 — include users registered strictly before this instant.'),
  })
  .strict();
export type EmailSegment = z.infer<typeof EmailSegmentSchema>;

const subject = z.string().trim().min(1).max(300);
const bodyHtml = z.string().trim().min(1).max(200_000);
const bodyText = z.string().trim().min(1).max(200_000);

export const CreateEmailCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    locale: z.enum(Locales).default('en'),
    subject,
    bodyHtml,
    bodyText,
    segment: EmailSegmentSchema.default({ onlyVerified: true }),
    /// Optional ISO-8601 instant. If present, status is set to SCHEDULED;
    /// otherwise DRAFT.
    scheduledFor: z.string().datetime().optional(),
  })
  .strict();
export type CreateEmailCampaignInput = z.infer<typeof CreateEmailCampaignSchema>;

export const UpdateEmailCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    locale: z.enum(Locales),
    subject,
    bodyHtml,
    bodyText,
    segment: EmailSegmentSchema,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateEmailCampaignInput = z.infer<typeof UpdateEmailCampaignSchema>;

export const ScheduleEmailCampaignSchema = z
  .object({
    /// ISO-8601 instant in the future.
    scheduledFor: z.string().datetime(),
  })
  .strict();
export type ScheduleEmailCampaignInput = z.infer<typeof ScheduleEmailCampaignSchema>;

export const ListEmailCampaignsQuerySchema = z
  .object({
    status: z.enum(EmailCampaignStatuses).optional(),
    q: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ListEmailCampaignsQuery = z.infer<typeof ListEmailCampaignsQuerySchema>;

export const SegmentPreviewQuerySchema = z
  .object({
    /// Stringified JSON of EmailSegment, since this is a GET endpoint.
    segment: z.string().min(2).max(4_000),
  })
  .strict();
export type SegmentPreviewQuery = z.infer<typeof SegmentPreviewQuerySchema>;

// =====================
// Drip sequences
// =====================

const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/u, {
    message: 'Slug must be lowercase, alphanumeric with hyphens.',
  });

export const CreateEmailDripSequenceSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug,
    trigger: z.enum(EmailDripTriggers).default('MANUAL'),
    enabled: z.boolean().optional().default(true),
  })
  .strict();
export type CreateEmailDripSequenceInput = z.infer<typeof CreateEmailDripSequenceSchema>;

export const UpdateEmailDripSequenceSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug,
    trigger: z.enum(EmailDripTriggers),
    enabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateEmailDripSequenceInput = z.infer<typeof UpdateEmailDripSequenceSchema>;

export const CreateEmailDripStepSchema = z
  .object({
    /// Cumulative delay since enrollment, in minutes. Must monotonically
    /// increase across steps within a sequence — checked server-side.
    delayMinutes: z.number().int().min(0).max(60 * 24 * 365),
    locale: z.enum(Locales).default('en'),
    subject,
    bodyHtml,
    bodyText,
  })
  .strict();
export type CreateEmailDripStepInput = z.infer<typeof CreateEmailDripStepSchema>;

export const UpdateEmailDripStepSchema = z
  .object({
    delayMinutes: z.number().int().min(0).max(60 * 24 * 365),
    locale: z.enum(Locales),
    subject,
    bodyHtml,
    bodyText,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateEmailDripStepInput = z.infer<typeof UpdateEmailDripStepSchema>;

export const EnrollDripSchema = z
  .object({
    sequenceId: z.string().min(1),
    userId: z.string().min(1),
  })
  .strict();
export type EnrollDripInput = z.infer<typeof EnrollDripSchema>;

export const ListDripEnrollmentsQuerySchema = z
  .object({
    sequenceId: z.string().min(1).optional(),
    state: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'ALL']).default('ACTIVE'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ListDripEnrollmentsQuery = z.infer<typeof ListDripEnrollmentsQuerySchema>;
