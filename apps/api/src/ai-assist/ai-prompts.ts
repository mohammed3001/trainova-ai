/**
 * Centralised prompt builders for the AI Assistant. Each function returns
 * a `{system, user}` pair matching the OpenAI Chat Completions shape.
 *
 * Design rules:
 *  - System prompt always specifies the OUTPUT SHAPE (JSON keys + types)
 *    because we re-validate the response against zod and reject hallucinated
 *    fields. Keys MUST match `packages/shared/src/ai-assist.ts`.
 *  - Inputs are pre-redacted at the service layer; do not pass emails,
 *    phone numbers, or unsanitized HTML through these helpers.
 *  - Locale is always passed explicitly; the LLM is instructed to write
 *    the *user-visible* fields in that locale, but JSON keys stay English.
 */

import type { ChatMessage } from './ai-provider';

const JSON_RULE =
  'Return strict JSON with the exact keys described. No prose outside JSON. Do not wrap the JSON in code fences.';

function lang(locale: string): string {
  switch (locale) {
    case 'ar':
      return 'Arabic (العربية)';
    case 'fr':
      return 'French (Français)';
    case 'es':
      return 'Spanish (Español)';
    default:
      return 'English';
  }
}

export function buildRequestDraftPrompt(args: {
  brief: string;
  industry?: string;
  locale: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are an assistant that helps companies post AI-training job requests on Trainova AI.
Given a short brief, produce a polished, structured job request.
${JSON_RULE}

Output JSON shape:
{
  "title": string (8-200 chars),
  "description": string (80-8000 chars, markdown-light, no code fences),
  "skills": string[] (max 20, lowercase keyword tags like "fine-tuning"),
  "budgetUsdMin": integer USD or null,
  "budgetUsdMax": integer USD or null,
  "conditions": string[] (max 15, e.g. "Must sign NDA", "5+ years RLHF"),
  "durationDays": integer or null
}

Title and description in ${lang(args.locale)}. Skills always lowercase English tags.`,
    },
    {
      role: 'user',
      content: `Industry: ${args.industry ?? 'unspecified'}
Brief:
${args.brief}`,
    },
  ];
}

export function buildApplicationScreenPrompt(args: {
  jobTitle: string;
  jobDescription: string;
  jobSkills: string[];
  applicantHeadline: string;
  applicantBio: string;
  applicantSkills: string[];
  applicantYearsExperience: number | null;
  coverLetter: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are an assistant that screens trainer applications for AI-training jobs.
Score fit (0-100), summarise pros/cons, and recommend a next step.
${JSON_RULE}

Output JSON shape:
{
  "fitScore": integer 0-100,
  "summary": string (40-2000 chars),
  "strengths": string[] (max 10),
  "risks": string[] (max 10),
  "recommendation": "INTERVIEW" | "TEST" | "REJECT" | "SHORTLIST"
}

Use SHORTLIST when score >= 80, INTERVIEW when 60-79, TEST when 40-59, REJECT below 40.`,
    },
    {
      role: 'user',
      content: `JOB
Title: ${args.jobTitle}
Skills: ${args.jobSkills.join(', ') || '(none specified)'}
Description: ${args.jobDescription}

APPLICANT
Headline: ${args.applicantHeadline}
Years experience: ${args.applicantYearsExperience ?? 'unknown'}
Skills: ${args.applicantSkills.join(', ') || '(none listed)'}
Bio: ${args.applicantBio}
Cover letter: ${args.coverLetter || '(none)'}`,
    },
  ];
}

export function buildChatSummaryPrompt(args: {
  messages: Array<{ author: string; text: string }>;
  goal: 'summary' | 'tasks';
}): ChatMessage[] {
  const transcript = args.messages.map((m) => `${m.author}: ${m.text}`).join('\n');
  if (args.goal === 'summary') {
    return [
      {
        role: 'system',
        content: `You summarise project conversations between a company and an AI trainer.
${JSON_RULE}

Output JSON shape:
{
  "summary": string (40-4000 chars, neutral third-person),
  "keyPoints": string[] (max 10, action-relevant bullets),
  "language": string (ISO 639-1 of the conversation, e.g. "en", "ar")
}`,
      },
      { role: 'user', content: `Transcript:\n${transcript}` },
    ];
  }
  return [
    {
      role: 'system',
      content: `Extract concrete action items (tasks) from the project conversation.
Skip greetings, opinions, and questions without commitments.
${JSON_RULE}

Output JSON shape:
{
  "tasks": Array<{
    "text": string (3-500 chars, imperative voice),
    "ownerHint": string (who should do it, or null),
    "dueHint": string (when, or null)
  }> (max 20)
}`,
    },
    { role: 'user', content: `Transcript:\n${transcript}` },
  ];
}

export function buildSeoMetaPrompt(args: {
  resource: string;
  topic: string;
  body: string;
  locale: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You write SEO metadata for Trainova AI, a marketplace for AI-training experts.
${JSON_RULE}

Output JSON shape:
{
  "metaTitle": string (10-70 chars, includes the keyword once),
  "metaDescription": string (50-160 chars, ends with a call-to-value),
  "keywords": string[] (max 15, lowercase, no hashes),
  "slug": string (lowercase kebab-case, max 80 chars, ASCII only)
}

Title and description in ${lang(args.locale)}. Slug always English ASCII.`,
    },
    {
      role: 'user',
      content: `Resource type: ${args.resource}
Topic: ${args.topic}
Body context (truncated to 2000 chars):
${args.body.slice(0, 2000)}`,
    },
  ];
}

export function buildEmailDraftPrompt(args: {
  audience: 'TRAINER' | 'COMPANY' | 'CUSTOM';
  intent: string;
  tone?: string;
  locale: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You draft transactional/marketing emails for Trainova AI.
${JSON_RULE}

Output JSON shape:
{
  "subject": string (5-180 chars),
  "preheader": string (10-160 chars, complements the subject),
  "bodyHtml": string (40-20000 chars, simple HTML: p/strong/em/a/ul/li/h2/h3 only, no scripts/styles/images),
  "bodyText": string (40-20000 chars, plain-text equivalent of bodyHtml)
}

All copy in ${lang(args.locale)}. Audience: ${args.audience}. Tone hint: ${args.tone ?? 'professional, warm'}.`,
    },
    { role: 'user', content: `Intent:\n${args.intent}` },
  ];
}

export function buildPricingSuggestPrompt(args: {
  jobTitle: string;
  jobDescription: string;
  jobSkills: string[];
  jobDurationDays: number | null;
  comparableContractsCount: number;
  comparableMedianCents: number | null;
  currency: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You suggest pricing ranges for AI-training contracts on Trainova.
${JSON_RULE}

Output JSON shape:
{
  "currency": string (ISO 4217, exactly 3 letters — match the request currency),
  "minCents": integer >= 0,
  "maxCents": integer >= minCents,
  "pointCents": integer between min and max,
  "rationale": string (40-2000 chars)
}

Base your numbers on: scope (skills count, duration), comparable contract median if provided, and typical platform rates.`,
    },
    {
      role: 'user',
      content: `Currency: ${args.currency}
Title: ${args.jobTitle}
Skills: ${args.jobSkills.join(', ') || '(none)'}
Duration days: ${args.jobDurationDays ?? 'unspecified'}
Comparable contracts in same skill bucket: ${args.comparableContractsCount}
Median comparable price (cents): ${args.comparableMedianCents ?? 'no data'}
Description: ${args.jobDescription}`,
    },
  ];
}

export function buildTestGenPrompt(args: {
  jobTitle: string;
  jobDescription: string;
  jobSkills: string[];
  taskCount: number;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You generate practical test tasks to evaluate AI-training candidates.
${JSON_RULE}

Output JSON shape:
{
  "tasks": Array<{
    "title": string (5-200 chars),
    "prompt": string (20-4000 chars, the actual instruction to the candidate),
    "rubric": string (20-2000 chars, scoring criteria for human/AI grader),
    "expectedSeconds": integer (60-14400),
    "kind": "MULTIPLE_CHOICE" | "TEXT" | "CODE" | "FILE_UPLOAD"
  }> (exactly ${args.taskCount} items)
}

Mix theoretical and practical. Avoid trick questions. Each task must be answerable without external paid services.`,
    },
    {
      role: 'user',
      content: `Job title: ${args.jobTitle}
Skills: ${args.jobSkills.join(', ') || '(none)'}
Description:
${args.jobDescription}`,
    },
  ];
}

export function buildProfileOptPrompt(args: {
  currentHeadline: string;
  currentBio: string;
  currentSkills: string[];
  yearsExperience: number | null;
  languages: string[];
  locale: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You optimise an AI-trainer profile to attract more company offers.
${JSON_RULE}

Output JSON shape:
{
  "headline": string (10-140 chars, value-led, no clickbait),
  "bio": string (80-4000 chars, third-person, scannable, includes a brief credentials line),
  "suggestedSkills": string[] (max 15, lowercase, additive — do not repeat existing skills verbatim),
  "tips": string[] (max 10, concrete improvement actions)
}

Write headline and bio in ${lang(args.locale)}. Skills stay lowercase English.`,
    },
    {
      role: 'user',
      content: `Years experience: ${args.yearsExperience ?? 'unknown'}
Spoken languages: ${args.languages.join(', ') || '(none)'}
Current skills: ${args.currentSkills.join(', ') || '(none)'}
Current headline: ${args.currentHeadline}
Current bio:
${args.currentBio}`,
    },
  ];
}
