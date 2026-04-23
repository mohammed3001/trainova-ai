import { z } from 'zod';

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
});
export type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>;

export const applyToRequestSchema = z.object({
  requestId: z.string().cuid(),
  coverLetter: z.string().max(5000).optional(),
  proposedRate: z.number().int().nonnegative().optional(),
  proposedTimelineDays: z.number().int().min(1).max(365).optional(),
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
