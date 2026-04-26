import { z } from 'zod';

/**
 * Learning paths (T9.M) — Zod schemas shared between API and Web.
 *
 * The path model is admin-authored, the enrollment + step-progress models
 * are user-authored. We keep two separate schema groups so the admin
 * surface can extend (publish/unpublish, reorder, delete with cascade)
 * without leaking those mutations into the trainer-facing endpoints.
 */

export const LEARNING_PATH_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type LearningPathLevel = (typeof LEARNING_PATH_LEVELS)[number];

export const LEARNING_STEP_KINDS = ['ARTICLE', 'LINK', 'VIDEO', 'REFLECTION'] as const;
export type LearningStepKind = (typeof LEARNING_STEP_KINDS)[number];

/** Slug must be URL-safe and reasonable to type. Mirrors the rules used
 *  for `JobRequest.slug` and `Article.slug`. */
const slugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case');

const stepBaseSchema = z.object({
  kind: z.enum(LEARNING_STEP_KINDS),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  url: z.string().url().max(2048).nullish(),
});

/** A LINK or VIDEO step requires `url`; ARTICLE/REFLECTION must not have one
 *  (we render the body inline instead). The refinement runs server-side
 *  *and* in the admin form so the operator gets immediate feedback. */
export const learningStepInputSchema = stepBaseSchema.superRefine((step, ctx) => {
  if (step.kind === 'LINK' || step.kind === 'VIDEO') {
    if (!step.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: `url is required for ${step.kind} steps`,
      });
    }
  } else if (step.url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['url'],
      message: `${step.kind} steps must not include a url`,
    });
  }
});
export type LearningStepInput = z.infer<typeof learningStepInputSchema>;

export const createLearningPathSchema = z.object({
  slug: slugSchema,
  title: z.string().min(3).max(200),
  summary: z.string().min(10).max(280),
  description: z.string().min(10).max(10_000),
  level: z.enum(LEARNING_PATH_LEVELS).default('BEGINNER'),
  industry: z.string().max(80).nullish(),
  estimatedHours: z.number().int().min(1).max(200).default(2),
  steps: z.array(learningStepInputSchema).min(1).max(30),
});
export type CreateLearningPathInput = z.infer<typeof createLearningPathSchema>;

/** Update accepts the same shape as create (sans steps — steps have
 *  their own replace endpoint so reordering is explicit). All fields
 *  are optional; the controller validates "at least one field present". */
export const updateLearningPathSchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().min(3).max(200).optional(),
  summary: z.string().min(10).max(280).optional(),
  description: z.string().min(10).max(10_000).optional(),
  level: z.enum(LEARNING_PATH_LEVELS).optional(),
  industry: z.string().max(80).nullish(),
  estimatedHours: z.number().int().min(1).max(200).optional(),
});
export type UpdateLearningPathInput = z.infer<typeof updateLearningPathSchema>;

export const replaceLearningStepsSchema = z.object({
  steps: z.array(learningStepInputSchema).min(1).max(30),
});
export type ReplaceLearningStepsInput = z.infer<typeof replaceLearningStepsSchema>;

export const setLearningPathPublishSchema = z.object({
  isPublished: z.boolean(),
});
export type SetLearningPathPublishInput = z.infer<typeof setLearningPathPublishSchema>;

export const completeLearningStepSchema = z.object({
  /** Optional self-typed reflection text for REFLECTION-kind steps.
   *  Other kinds reject any payload — the body is just `{}`. */
  reflection: z.string().max(4000).optional(),
});
export type CompleteLearningStepInput = z.infer<typeof completeLearningStepSchema>;

export const listLearningPathsQuerySchema = z.object({
  level: z.enum(LEARNING_PATH_LEVELS).optional(),
  industry: z.string().max(80).optional(),
  q: z.string().max(120).optional(),
});
export type ListLearningPathsQuery = z.infer<typeof listLearningPathsQuerySchema>;

/** Per-user enrollment cap. Generous enough for browsing; low enough
 *  that we won't hold the email cron hostage on a runaway account. */
export const LEARNING_PATH_PER_USER_ENROLLMENT_LIMIT = 50;
/** Maximum embedded-video host whitelist — kept narrow on purpose so
 *  the iframe sandbox stays auditable. */
export const LEARNING_VIDEO_HOSTS_WHITELIST = [
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
] as const;
