import { z } from 'zod';
import { applicationFormSchema } from './application-form';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  role: z.enum(['COMPANY_OWNER', 'TRAINER']),
  locale: z.enum(['en', 'ar']).optional().default('en'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(16).max(256),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z.string().email(),
  locale: z.enum(['en', 'ar']).optional().default('en'),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  locale: z.enum(['en', 'ar']).optional().default('en'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const createJobRequestSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20),
  objective: z.string().max(2000).optional(),
  modelFamily: z.string().max(80).optional(),
  industry: z.string().max(80).optional(),
  languages: z.array(z.string()).max(20).default([]),
  skills: z.array(z.string()).max(30).default([]),
  durationDays: z.number().int().min(1).max(365).optional(),
  budgetMin: z.number().int().nonnegative().optional(),
  budgetMax: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  workType: z.enum(['REMOTE', 'ONSITE', 'HYBRID']).default('REMOTE'),
  confidentialityLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('LOW'),
  applicationSchema: applicationFormSchema.nullable().optional(),
});
export type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>;

export const applyToRequestSchema = z.object({
  requestId: z.string().cuid(),
  coverLetter: z.string().max(5000).optional(),
  proposedRate: z.number().int().nonnegative().optional(),
  proposedTimelineDays: z.number().int().min(1).max(365).optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
});
export type ApplyToRequestInput = z.infer<typeof applyToRequestSchema>;

export const updateApplicationStatusSchema = z.object({
  status: z.enum([
    'APPLIED',
    'SHORTLISTED',
    'TEST_ASSIGNED',
    'TEST_SUBMITTED',
    'INTERVIEW',
    'OFFERED',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
  ]),
  note: z.string().max(500).optional(),
});
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;

export const SKILL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

// A skill may be passed as either a bare slug (legacy) or as a richer
// object with level + years of experience. The server normalises both.
export const trainerSkillRefSchema = z.union([
  z.string().min(1).max(80),
  z.object({
    slug: z.string().min(1).max(80),
    level: z.enum(SKILL_LEVELS).optional(),
    yearsExperience: z.number().int().min(0).max(60).optional(),
  }),
]);
export type TrainerSkillRef = z.infer<typeof trainerSkillRefSchema>;

export const updateTrainerProfileSchema = z
  .object({
    headline: z.string().max(160).optional(),
    bio: z.string().max(4000).optional(),
    country: z.string().max(80).optional(),
    languages: z.array(z.string().min(1).max(40)).max(20).optional(),
    timezone: z.string().max(80).optional(),
    availability: z.string().max(200).optional(),
    responseTimeHours: z.number().int().min(0).max(720).optional(),
    hourlyRateMin: z.number().int().nonnegative().optional(),
    hourlyRateMax: z.number().int().nonnegative().optional(),
    linkedinUrl: z.string().url().optional().or(z.literal('')),
    githubUrl: z.string().url().optional().or(z.literal('')),
    websiteUrl: z.string().url().optional().or(z.literal('')),
    skills: z.array(trainerSkillRefSchema).max(40).optional(),
  })
  .refine(
    (v) =>
      v.hourlyRateMin === undefined ||
      v.hourlyRateMax === undefined ||
      v.hourlyRateMin <= v.hourlyRateMax,
    { message: 'hourlyRateMin must be ≤ hourlyRateMax', path: ['hourlyRateMax'] },
  );
export type UpdateTrainerProfileInput = z.infer<typeof updateTrainerProfileSchema>;

// =========================================================================
// Tests (evaluations)
// =========================================================================

// MVP task types exposed in the editor. Other schema values (PROMPT_TUNE,
// LABEL, LIVE_PROMPT, WORKFLOW) remain in the enum for future use but are
// not authorable in this cycle.
export const TEST_TASK_TYPE_MVP = ['MCQ', 'TEXT', 'CODE'] as const;
export type TestTaskTypeMvp = (typeof TEST_TASK_TYPE_MVP)[number];

export const TEST_SCORING_MODES = ['AUTO', 'MANUAL', 'HYBRID'] as const;
export type TestScoringMode = (typeof TEST_SCORING_MODES)[number];

export const testTaskInputSchema = z
  .object({
    // Optional id: present when updating an existing task, absent when creating
    // a new one inside PATCH /tests/:id.
    id: z.string().cuid().optional(),
    prompt: z.string().min(3).max(4000),
    type: z.enum(TEST_TASK_TYPE_MVP),
    options: z.array(z.string().min(1).max(400)).max(10).default([]),
    answerKey: z.string().max(400).optional().nullable(),
    rubric: z
      .object({ hint: z.string().max(2000).optional() })
      .optional()
      .nullable(),
    maxScore: z.number().int().min(1).max(100).default(10),
    order: z.number().int().min(0).max(1000).default(0),
  })
  .refine(
    (v) => {
      if (v.type !== 'MCQ') return true;
      if (!v.options || v.options.length < 2) return false;
      if (!v.answerKey) return false;
      return v.options.includes(v.answerKey);
    },
    {
      message: 'MCQ tasks need ≥ 2 options and an answerKey that matches one option',
      path: ['answerKey'],
    },
  );
export type TestTaskInput = z.infer<typeof testTaskInputSchema>;

export const createTestSchema = z.object({
  requestId: z.string().cuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  timeLimitMin: z.number().int().min(1).max(480).optional(),
  passingScore: z.number().int().min(0).max(100).default(60),
  scoringMode: z.enum(TEST_SCORING_MODES).default('HYBRID'),
  tasks: z.array(testTaskInputSchema).max(50).default([]),
});
export type CreateTestInput = z.infer<typeof createTestSchema>;

export const updateTestSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(4000).optional(),
  timeLimitMin: z.number().int().min(1).max(480).optional().nullable(),
  passingScore: z.number().int().min(0).max(100).optional(),
  scoringMode: z.enum(TEST_SCORING_MODES).optional(),
  tasks: z.array(testTaskInputSchema).max(50).optional(),
});
export type UpdateTestInput = z.infer<typeof updateTestSchema>;

export const assignTestSchema = z.object({
  testId: z.string().cuid(),
});
export type AssignTestInput = z.infer<typeof assignTestSchema>;

export const testAttemptResponseSchema = z.object({
  taskId: z.string().cuid(),
  // Server stores as JSON. Accept any primitive/object — service layer narrows.
  response: z.unknown(),
});
export type TestAttemptResponseInput = z.infer<typeof testAttemptResponseSchema>;

export const submitAttemptSchema = z.object({
  responses: z.array(testAttemptResponseSchema).max(50),
});
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

export const gradeAttemptSchema = z.object({
  grades: z
    .array(
      z.object({
        taskId: z.string().cuid(),
        manualScore: z.number().int().min(0).max(100),
        comments: z.string().max(2000).optional(),
      }),
    )
    .max(50),
  reviewerNotes: z.string().max(4000).optional(),
});
export type GradeAttemptInput = z.infer<typeof gradeAttemptSchema>;

// =========================================================================

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  country: z.string().max(80).optional(),
  industry: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  description: z.string().max(4000).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().cuid(),
  body: z.string().min(1).max(5000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const startConversationSchema = z.object({
  otherUserId: z.string().cuid(),
  requestId: z.string().cuid().optional(),
});
export type StartConversationInput = z.infer<typeof startConversationSchema>;

// =========================================================================
// Admin (T5.A)
// =========================================================================

export const adminListUsersQuerySchema = z.object({
  q: z.string().max(200).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'COMPANY_OWNER', 'COMPANY_MEMBER', 'TRAINER']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

export const adminSetUserRoleSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'COMPANY_OWNER', 'COMPANY_MEMBER', 'TRAINER']),
});
export type AdminSetUserRoleInput = z.infer<typeof adminSetUserRoleSchema>;

export const adminSetUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']),
});
export type AdminSetUserStatusInput = z.infer<typeof adminSetUserStatusSchema>;

export const adminListCompaniesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  verified: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListCompaniesQuery = z.infer<typeof adminListCompaniesQuerySchema>;

export const adminListTrainersQuerySchema = z.object({
  q: z.string().max(200).optional(),
  verified: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListTrainersQuery = z.infer<typeof adminListTrainersQuerySchema>;

export const adminSetVerifiedSchema = z.object({
  verified: z.boolean(),
});
export type AdminSetVerifiedInput = z.infer<typeof adminSetVerifiedSchema>;

// Verification (submitter side)

export const verificationDocumentSchema = z.object({
  objectKey: z.string().min(1).max(500),
  title: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type VerificationDocument = z.infer<typeof verificationDocumentSchema>;

export const submitVerificationSchema = z.object({
  targetType: z.enum(['COMPANY', 'TRAINER']),
  documents: z.array(verificationDocumentSchema).min(1).max(10),
  notes: z.string().max(2000).optional(),
});
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

export const adminListVerificationQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  targetType: z.enum(['COMPANY', 'TRAINER']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListVerificationQuery = z.infer<typeof adminListVerificationQuerySchema>;

export const reviewVerificationSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().max(2000).optional(),
});
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;

// =========================================================================
// Admin — T5.B (requests · tests · chat moderation · reports · analytics)
// =========================================================================

export const jobRequestStatusEnum = z.enum([
  'DRAFT',
  'OPEN',
  'IN_REVIEW',
  'CLOSED',
  'ARCHIVED',
]);

export const adminListRequestsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: jobRequestStatusEnum.optional(),
  companyId: z.string().cuid().optional(),
  featured: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListRequestsQuery = z.infer<typeof adminListRequestsQuerySchema>;

export const adminSetRequestStatusSchema = z.object({
  status: jobRequestStatusEnum,
  reason: z.string().max(1000).optional(),
});
export type AdminSetRequestStatusInput = z.infer<typeof adminSetRequestStatusSchema>;

export const adminSetRequestFeaturedSchema = z.object({
  featured: z.boolean(),
});
export type AdminSetRequestFeaturedInput = z.infer<typeof adminSetRequestFeaturedSchema>;

export const adminListTestsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  companyId: z.string().cuid().optional(),
  requestId: z.string().cuid().optional(),
  scoringMode: z.enum(['AUTO', 'MANUAL', 'HYBRID']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListTestsQuery = z.infer<typeof adminListTestsQuerySchema>;

export const adminListAttemptsQuerySchema = z.object({
  testId: z.string().cuid().optional(),
  trainerId: z.string().cuid().optional(),
  status: z.enum(['IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListAttemptsQuery = z.infer<typeof adminListAttemptsQuerySchema>;

export const adminListConversationsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  lockedOnly: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  hasReports: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListConversationsQuery = z.infer<typeof adminListConversationsQuerySchema>;

export const adminLockConversationSchema = z.object({
  locked: z.boolean(),
  reason: z.string().max(1000).optional(),
});
export type AdminLockConversationInput = z.infer<typeof adminLockConversationSchema>;

export const adminRedactMessageSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type AdminRedactMessageInput = z.infer<typeof adminRedactMessageSchema>;

// Reports (user-submitted moderation reports)

export const reportTargetTypeEnum = z.enum([
  'USER',
  'COMPANY',
  'TRAINER',
  'REQUEST',
  'APPLICATION',
  'MESSAGE',
  'CONVERSATION',
  'REVIEW',
  'TEST',
  'OTHER',
]);

export const reportCategoryEnum = z.enum([
  'SPAM',
  'HARASSMENT',
  'INAPPROPRIATE',
  'FRAUD',
  'IMPERSONATION',
  'COPYRIGHT',
  'SAFETY',
  'OTHER',
]);

export const reportStatusEnum = z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']);

export const reportResolutionEnum = z.enum([
  'NO_ACTION',
  'WARNING_ISSUED',
  'CONTENT_REMOVED',
  'USER_SUSPENDED',
  'USER_BANNED',
  'ESCALATED',
]);

export const createReportSchema = z.object({
  targetType: reportTargetTypeEnum,
  targetId: z.string().min(1).max(64),
  category: reportCategoryEnum,
  reason: z.string().min(5).max(2000),
  evidenceUrls: z.array(z.string().url()).max(10).default([]),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const adminListReportsQuerySchema = z.object({
  status: reportStatusEnum.optional(),
  targetType: reportTargetTypeEnum.optional(),
  category: reportCategoryEnum.optional(),
  reporterId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(64).optional(),
});
export type AdminListReportsQuery = z.infer<typeof adminListReportsQuerySchema>;

export const reviewReportSchema = z
  .object({
    status: reportStatusEnum,
    resolution: reportResolutionEnum.optional(),
    resolverNotes: z.string().max(2000).optional(),
  })
  .refine(
    (val) =>
      (val.status !== 'RESOLVED' && val.status !== 'DISMISSED') || val.resolution != null,
    { message: 'Resolution is required when closing a report', path: ['resolution'] },
  );
export type ReviewReportInput = z.infer<typeof reviewReportSchema>;

// Analytics

export const adminAnalyticsRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type AdminAnalyticsRange = z.infer<typeof adminAnalyticsRangeSchema>;
