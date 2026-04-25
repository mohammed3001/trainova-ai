import { z } from 'zod';

/**
 * AI Assistant — typed I/O contracts shared between API and Web.
 *
 * One zod schema per `AiAssistKind` for both input and output. The API
 * validates inputs at the controller boundary and re-validates outputs
 * after the LLM responds (LLMs occasionally hallucinate fields). Web
 * imports these to render strongly-typed forms and result panels.
 */

export const aiAssistKinds = [
  'REQUEST_DRAFT',
  'APPLICATION_SCREEN',
  'CHAT_SUMMARY',
  'CHAT_TASKS',
  'SEO_META',
  'EMAIL_DRAFT',
  'PRICING_SUGGEST',
  'TEST_GEN',
  'PROFILE_OPT',
] as const;
export type AiAssistKind = (typeof aiAssistKinds)[number];

// -------------------------------------------------------------------
// REQUEST_DRAFT
// -------------------------------------------------------------------

export const requestDraftInputSchema = z.object({
  brief: z.string().trim().min(20).max(4000),
  /** Free-text industry hint (e.g. "fintech", "healthcare"). */
  industry: z.string().trim().max(80).optional(),
  /** Preferred locale of the generated draft. */
  locale: z.enum(['en', 'ar', 'fr', 'es']).default('en'),
});
export type RequestDraftInput = z.infer<typeof requestDraftInputSchema>;

export const requestDraftOutputSchema = z.object({
  title: z.string().trim().min(8).max(200),
  description: z.string().trim().min(80).max(8000),
  skills: z.array(z.string().trim().min(2).max(60)).max(20),
  budgetUsdMin: z.number().int().min(0).max(10_000_000).nullable(),
  budgetUsdMax: z.number().int().min(0).max(10_000_000).nullable(),
  durationDays: z.number().int().min(1).max(365).nullable(),
  conditions: z.array(z.string().trim().min(3).max(300)).max(15),
});
export type RequestDraftOutput = z.infer<typeof requestDraftOutputSchema>;

// -------------------------------------------------------------------
// APPLICATION_SCREEN
// -------------------------------------------------------------------

export const applicationScreenInputSchema = z.object({
  applicationId: z.string().min(1),
});
export type ApplicationScreenInput = z.infer<typeof applicationScreenInputSchema>;

export const applicationScreenOutputSchema = z.object({
  /** 0–100 fit score against the request. */
  fitScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(40).max(2000),
  strengths: z.array(z.string().trim().min(3).max(200)).max(10),
  risks: z.array(z.string().trim().min(3).max(200)).max(10),
  recommendation: z.enum(['INTERVIEW', 'TEST', 'REJECT', 'SHORTLIST']),
});
export type ApplicationScreenOutput = z.infer<typeof applicationScreenOutputSchema>;

// -------------------------------------------------------------------
// CHAT_SUMMARY
// -------------------------------------------------------------------

export const chatSummaryInputSchema = z.object({
  conversationId: z.string().min(1),
  /** Cap message count so prompt size stays bounded. */
  maxMessages: z.number().int().min(5).max(200).default(80),
});
export type ChatSummaryInput = z.infer<typeof chatSummaryInputSchema>;

export const chatSummaryOutputSchema = z.object({
  summary: z.string().trim().min(40).max(4000),
  keyPoints: z.array(z.string().trim().min(3).max(300)).max(10),
  /** Detected language of the conversation, ISO 639-1. */
  language: z.string().trim().min(2).max(8),
  upToMessageId: z.string().min(1),
});
export type ChatSummaryOutput = z.infer<typeof chatSummaryOutputSchema>;

// -------------------------------------------------------------------
// CHAT_TASKS
// -------------------------------------------------------------------

export const chatTasksInputSchema = chatSummaryInputSchema;
export type ChatTasksInput = z.infer<typeof chatTasksInputSchema>;

export const chatTaskItemSchema = z.object({
  text: z.string().trim().min(3).max(500),
  ownerHint: z.string().trim().max(120).nullable(),
  dueHint: z.string().trim().max(120).nullable(),
});
export const chatTasksOutputSchema = z.object({
  tasks: z.array(chatTaskItemSchema).max(20),
  upToMessageId: z.string().min(1),
});
export type ChatTasksOutput = z.infer<typeof chatTasksOutputSchema>;

// -------------------------------------------------------------------
// SEO_META
// -------------------------------------------------------------------

export const seoMetaInputSchema = z.object({
  /** What kind of resource we're producing meta for. */
  resource: z.enum(['Page', 'Article', 'JobRequest', 'TrainerProfile', 'Skill', 'Company']),
  /** Working title or topic. */
  topic: z.string().trim().min(3).max(200),
  /** Body or context to summarize. */
  body: z.string().trim().min(10).max(20_000),
  locale: z.enum(['en', 'ar', 'fr', 'es']).default('en'),
});
export type SeoMetaInput = z.infer<typeof seoMetaInputSchema>;

export const seoMetaOutputSchema = z.object({
  metaTitle: z.string().trim().min(10).max(70),
  metaDescription: z.string().trim().min(50).max(160),
  keywords: z.array(z.string().trim().min(2).max(40)).max(15),
  /** Suggested canonical slug (lowercase kebab-case). */
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase kebab-case'),
});
export type SeoMetaOutput = z.infer<typeof seoMetaOutputSchema>;

// -------------------------------------------------------------------
// EMAIL_DRAFT
// -------------------------------------------------------------------

export const emailDraftInputSchema = z.object({
  audience: z.enum(['TRAINER', 'COMPANY', 'CUSTOM']),
  intent: z.string().trim().min(10).max(500),
  /** Optional tone hint, free-text. */
  tone: z.string().trim().max(80).optional(),
  locale: z.enum(['en', 'ar', 'fr', 'es']).default('en'),
});
export type EmailDraftInput = z.infer<typeof emailDraftInputSchema>;

export const emailDraftOutputSchema = z.object({
  subject: z.string().trim().min(5).max(180),
  preheader: z.string().trim().min(10).max(160),
  bodyHtml: z.string().trim().min(40).max(20_000),
  bodyText: z.string().trim().min(40).max(20_000),
});
export type EmailDraftOutput = z.infer<typeof emailDraftOutputSchema>;

// -------------------------------------------------------------------
// PRICING_SUGGEST
// -------------------------------------------------------------------

export const pricingSuggestInputSchema = z.object({
  jobRequestId: z.string().min(1),
});
export type PricingSuggestInput = z.infer<typeof pricingSuggestInputSchema>;

export const pricingSuggestOutputSchema = z.object({
  /** Authoritative currency for the suggestion (matches the request). */
  currency: z.string().trim().length(3),
  /** Whole-cent integers; rendering applies user's display currency separately. */
  minCents: z.number().int().min(0),
  maxCents: z.number().int().min(0),
  /** Single point estimate (e.g. median). */
  pointCents: z.number().int().min(0),
  rationale: z.string().trim().min(40).max(2000),
});
export type PricingSuggestOutput = z.infer<typeof pricingSuggestOutputSchema>;

// -------------------------------------------------------------------
// TEST_GEN
// -------------------------------------------------------------------

export const testGenInputSchema = z.object({
  jobRequestId: z.string().min(1),
  /** How many tasks to generate. */
  taskCount: z.number().int().min(1).max(8).default(3),
});
export type TestGenInput = z.infer<typeof testGenInputSchema>;

export const testGenTaskSchema = z.object({
  title: z.string().trim().min(5).max(200),
  prompt: z.string().trim().min(20).max(4000),
  rubric: z.string().trim().min(20).max(2000),
  expectedSeconds: z.number().int().min(60).max(60 * 60 * 4),
  kind: z.enum(['MULTIPLE_CHOICE', 'TEXT', 'CODE', 'FILE_UPLOAD']),
});
export const testGenOutputSchema = z.object({
  tasks: z.array(testGenTaskSchema).min(1).max(8),
});
export type TestGenOutput = z.infer<typeof testGenOutputSchema>;

// -------------------------------------------------------------------
// PROFILE_OPT
// -------------------------------------------------------------------

export const profileOptInputSchema = z.object({
  trainerProfileId: z.string().min(1),
});
export type ProfileOptInput = z.infer<typeof profileOptInputSchema>;

export const profileOptOutputSchema = z.object({
  headline: z.string().trim().min(10).max(140),
  bio: z.string().trim().min(80).max(4000),
  /** New / refined skill suggestions to add. */
  suggestedSkills: z.array(z.string().trim().min(2).max(60)).max(15),
  /** Concrete improvement tips, ordered. */
  tips: z.array(z.string().trim().min(5).max(300)).max(10),
});
export type ProfileOptOutput = z.infer<typeof profileOptOutputSchema>;

// -------------------------------------------------------------------
// History feed
// -------------------------------------------------------------------

export const aiAssistListQuerySchema = z.object({
  kind: z.enum(aiAssistKinds).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AiAssistListQuery = z.infer<typeof aiAssistListQuerySchema>;

export interface AiAssistRequestSummary {
  id: string;
  kind: AiAssistKind;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
  modelUsed: string | null;
  provider: string | null;
  contextEntityType: string | null;
  contextEntityId: string | null;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  durationMs: number | null;
  error: string | null;
  /** Output is included only on detail; list endpoints omit it. */
  output?: unknown;
}

export const AI_ASSIST_FLAG_KEY = 'ai_assistant';
