import { z } from 'zod';

/**
 * Evaluation pipelines (Tier 8.D).
 *
 * A pipeline is an ordered list of stages attached to a `JobRequest`.
 * Companies move applicants into the pipeline once and progress them
 * through each stage manually (or based on a linked Test attempt).
 * Stage kinds are deliberately small — every variant the product spec
 * mentions ("screening, practical, interview, final acceptance") maps
 * cleanly onto SCREENING / TEST / INTERVIEW / REVIEW.
 */

export const evaluationStageKindSchema = z.enum([
  'SCREENING',
  'TEST',
  'INTERVIEW',
  'REVIEW',
]);
export type EvaluationStageKind = z.infer<typeof evaluationStageKindSchema>;

export const evaluationStageStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'SKIPPED',
]);
export type EvaluationStageStatus = z.infer<typeof evaluationStageStatusSchema>;

export const applicationPipelineStatusSchema = z.enum([
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'WITHDRAWN',
]);
export type ApplicationPipelineStatus = z.infer<typeof applicationPipelineStatusSchema>;

export const PIPELINE_MIN_STAGES = 1;
export const PIPELINE_MAX_STAGES = 12;
export const PIPELINE_NAME_MAX = 120;
export const PIPELINE_DESCRIPTION_MAX = 2000;
export const STAGE_TITLE_MAX = 120;
export const STAGE_DESCRIPTION_MAX = 2000;
export const STAGE_NOTES_MAX = 4000;

const optionalShortText = z
  .string()
  .trim()
  .max(STAGE_DESCRIPTION_MAX)
  .optional()
  .or(z.literal('').transform(() => undefined));

const stageInputObject = z.object({
  kind: evaluationStageKindSchema,
  title: z.string().trim().min(1).max(STAGE_TITLE_MAX),
  description: optionalShortText,
  /** For kind=TEST only. Other kinds reject any non-null value. */
  testId: z.string().min(1).max(64).optional(),
  /** Override of the linked Test's passingScore. Ignored when kind != TEST. */
  passingScore: z.number().int().min(0).max(100).optional(),
  isRequired: z.boolean().default(true),
});

function stageRefiner<T extends { kind: EvaluationStageKind; testId?: string; passingScore?: number }>(
  stage: T,
  ctx: z.RefinementCtx,
): void {
  if (stage.kind === 'TEST' && !stage.testId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['testId'],
      message: '`testId` is required when stage kind is TEST',
    });
  }
  if (stage.kind !== 'TEST' && stage.testId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['testId'],
      message: '`testId` is only valid when stage kind is TEST',
    });
  }
  if (stage.kind !== 'TEST' && typeof stage.passingScore === 'number') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['passingScore'],
      message: '`passingScore` is only valid when stage kind is TEST',
    });
  }
}

const stageInputSchema = stageInputObject.superRefine(stageRefiner);

export type EvaluationStageInput = z.infer<typeof stageInputSchema>;

export const createPipelineSchema = z.object({
  requestId: z.string().min(1),
  name: z.string().trim().min(1).max(PIPELINE_NAME_MAX),
  description: z.string().trim().max(PIPELINE_DESCRIPTION_MAX).optional(),
  isActive: z.boolean().optional(),
  stages: z.array(stageInputSchema).min(PIPELINE_MIN_STAGES).max(PIPELINE_MAX_STAGES),
});
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

export const updatePipelineSchema = z.object({
  name: z.string().trim().min(1).max(PIPELINE_NAME_MAX).optional(),
  description: z.string().trim().max(PIPELINE_DESCRIPTION_MAX).optional().or(z.literal('').transform(() => '')),
  isActive: z.boolean().optional(),
});
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;

/**
 * Replace the entire stage list atomically. Sending an existing stage's
 * `id` keeps its persisted progress (results), while omitting it deletes
 * the stage (cascades the result rows).
 */
const replaceStageInputSchema = stageInputObject
  .extend({ id: z.string().min(1).max(64).optional() })
  .superRefine(stageRefiner);

export const replaceStagesSchema = z.object({
  stages: z
    .array(replaceStageInputSchema)
    .min(PIPELINE_MIN_STAGES)
    .max(PIPELINE_MAX_STAGES),
});
export type ReplaceStagesInput = z.infer<typeof replaceStagesSchema>;
export type ReplaceStageInput = z.infer<typeof replaceStageInputSchema>;

export const advanceStageSchema = z.object({
  /** 0..100 score recorded against the stage. Auto-filled from the
   *  TestAttempt for TEST stages — the manual field is ignored there. */
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(STAGE_NOTES_MAX).optional(),
});
export type AdvanceStageInput = z.infer<typeof advanceStageSchema>;

export const rejectStageSchema = z.object({
  reason: z.string().trim().max(STAGE_NOTES_MAX).optional(),
});
export type RejectStageInput = z.infer<typeof rejectStageSchema>;

export const skipStageSchema = z.object({
  reason: z.string().trim().max(STAGE_NOTES_MAX).optional(),
});
export type SkipStageInput = z.infer<typeof skipStageSchema>;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface EvaluationStageDto {
  id: string;
  pipelineId: string;
  order: number;
  kind: EvaluationStageKind;
  title: string;
  description: string | null;
  testId: string | null;
  testTitle: string | null;
  passingScore: number | null;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationPipelineDto {
  id: string;
  requestId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  stages: EvaluationStageDto[];
  /** Aggregate counts across all `ApplicationPipelineProgress` rows
   *  attached to this pipeline. Useful for the request dashboard. */
  stats: {
    inProgress: number;
    passed: number;
    failed: number;
    withdrawn: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationStageResultDto {
  id: string;
  stageId: string;
  status: EvaluationStageStatus;
  score: number | null;
  notes: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ApplicationPipelineProgressDto {
  id: string;
  pipelineId: string;
  applicationId: string;
  status: ApplicationPipelineStatus;
  currentStageId: string | null;
  results: ApplicationStageResultDto[];
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationPipelineSnapshotDto {
  pipeline: EvaluationPipelineDto;
  progress: ApplicationPipelineProgressDto | null;
}
