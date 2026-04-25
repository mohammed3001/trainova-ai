'use server';

import { authedFetch } from '@/lib/authed-fetch';
import type { AiAssistKind, AiAssistRequestSummary } from '@trainova/shared';

interface ApiError {
  status?: number;
  message?: string;
}

function toErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'object') {
    const e = err as ApiError;
    if (typeof e.message === 'string') return e.message;
  }
  return err instanceof Error ? err.message : String(err);
}

const KIND_TO_PATH: Record<AiAssistKind, string> = {
  REQUEST_DRAFT: '/ai-assist/request-draft',
  APPLICATION_SCREEN: '/ai-assist/application-screen',
  CHAT_SUMMARY: '/ai-assist/chat-summary',
  CHAT_TASKS: '/ai-assist/chat-tasks',
  SEO_META: '/ai-assist/seo-meta',
  EMAIL_DRAFT: '/ai-assist/email-draft',
  PRICING_SUGGEST: '/ai-assist/pricing-suggest',
  TEST_GEN: '/ai-assist/test-gen',
  PROFILE_OPT: '/ai-assist/profile-opt',
};

export async function runAiAssistAction(
  kind: AiAssistKind,
  input: Record<string, unknown>,
): Promise<
  | { ok: true; id: string; output: unknown }
  | { ok: false; error: string }
> {
  try {
    const path = KIND_TO_PATH[kind];
    const data = await authedFetch<{ id: string; output: unknown }>(path, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { ok: true, id: data.id, output: data.output };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function listAiAssistRequestsAction(kind?: AiAssistKind, limit = 20) {
  const qs = new URLSearchParams();
  if (kind) qs.set('kind', kind);
  qs.set('limit', String(limit));
  return authedFetch<AiAssistRequestSummary[]>(
    `/ai-assist/requests${qs.toString() ? `?${qs}` : ''}`,
  );
}

export async function getAiAssistRequestAction(id: string) {
  return authedFetch<AiAssistRequestSummary>(`/ai-assist/requests/${id}`);
}
