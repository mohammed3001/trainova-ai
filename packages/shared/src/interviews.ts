import { z } from 'zod';

/**
 * Interview scheduling (Tier 8.C).
 *
 * A scheduled meeting between a company-side user and a trainer, anchored
 * to an existing chat conversation (so authorization piggybacks on the
 * existing `ConversationParticipant` rows). Reschedules are modeled as
 * cancel-and-create — see `InterviewMeeting.rescheduledFromId` in the
 * Prisma schema.
 *
 * The platform deliberately does not host video itself at this tier; an
 * external `meetingUrl` (Zoom / Meet / Teams) is captured at create time
 * and forwarded to participants. T8.B will introduce a built-in voice +
 * video room and reuse this same record.
 */

export const interviewStatusSchema = z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

/** Wall-clock bounds. The lower bound is enforced server-side too — we
 *  reject `scheduledAt` values that resolve to the past once the request
 *  reaches the controller, regardless of client clock skew. */
export const INTERVIEW_MIN_DURATION_MIN = 15;
export const INTERVIEW_MAX_DURATION_MIN = 240;
export const INTERVIEW_DEFAULT_DURATION_MIN = 30;

/** How far in the future a meeting can be scheduled. Past this we'd be
 *  retaining a row that's almost certainly going to drift out of date. */
export const INTERVIEW_MAX_DAYS_AHEAD = 365;

const isoDateString = z
  .string()
  .datetime({ offset: true, message: 'Invalid ISO 8601 datetime' });

/** A non-empty IANA tz identifier. Validated more strictly server-side. */
const ianaTimezoneSchema = z.string().min(1).max(64);

/** Optional but trimmed-and-bounded human text. `null` is treated as
 *  "clear this field" on update — see service. */
const optionalShortText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal('').transform(() => undefined));

/** Optional URL — http(s) only. The same XSS-prevention rule as dispute
 *  evidence links (PR #44): no `javascript:` / `data:` / `vbscript:`. */
const meetingUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), {
    message: 'Meeting URL must use http(s)',
  });

export const createInterviewSchema = z.object({
  conversationId: z.string().min(1),
  applicationId: z.string().min(1).optional(),
  /** ISO-8601 with offset; resolved to UTC server-side. */
  scheduledAt: isoDateString,
  durationMin: z
    .number()
    .int()
    .min(INTERVIEW_MIN_DURATION_MIN)
    .max(INTERVIEW_MAX_DURATION_MIN)
    .default(INTERVIEW_DEFAULT_DURATION_MIN),
  timezone: ianaTimezoneSchema,
  meetingUrl: meetingUrlSchema.optional(),
  agenda: optionalShortText,
  notes: optionalShortText,
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

/** Reschedule = cancel old + create new in a single transaction. The
 *  caller passes `rescheduledFromId` so the API can chain the rows for
 *  audit. */
export const rescheduleInterviewSchema = z.object({
  scheduledAt: isoDateString,
  durationMin: z
    .number()
    .int()
    .min(INTERVIEW_MIN_DURATION_MIN)
    .max(INTERVIEW_MAX_DURATION_MIN)
    .optional(),
  timezone: ianaTimezoneSchema.optional(),
  meetingUrl: meetingUrlSchema.nullable().optional(),
  agenda: optionalShortText.or(z.literal(null)),
  notes: optionalShortText.or(z.literal(null)),
  reason: z.string().trim().max(500).optional(),
});
export type RescheduleInterviewInput = z.infer<typeof rescheduleInterviewSchema>;

export const cancelInterviewSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelInterviewInput = z.infer<typeof cancelInterviewSchema>;

export const completeInterviewSchema = z
  .object({
    notes: z.string().trim().max(2000).optional(),
  })
  .default({});
export type CompleteInterviewInput = z.infer<typeof completeInterviewSchema>;

export const listInterviewsQuerySchema = z.object({
  conversationId: z.string().min(1).optional(),
  status: interviewStatusSchema.optional(),
  /** When true, return only meetings whose `scheduledAt + durationMin`
   *  has not yet elapsed. Defaults to false (returns history too). */
  upcomingOnly: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListInterviewsQuery = z.infer<typeof listInterviewsQuerySchema>;

export interface InterviewParticipantSummary {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

export interface InterviewMeetingDto {
  id: string;
  conversationId: string;
  applicationId: string | null;
  scheduledAt: string;
  durationMin: number;
  timezone: string;
  meetingUrl: string | null;
  agenda: string | null;
  notes: string | null;
  status: InterviewStatus;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledBy: InterviewParticipantSummary | null;
  rescheduledFromId: string | null;
  rescheduledToId: string | null;
  completedAt: string | null;
  scheduledBy: InterviewParticipantSummary;
  trainer: InterviewParticipantSummary;
  createdAt: string;
  updatedAt: string;
  /** Convenience flag — true iff `scheduledAt + durationMin >= now()`. */
  isUpcoming: boolean;
  /** True iff the calling user can edit / cancel / complete this row. */
  canManage: boolean;
}
