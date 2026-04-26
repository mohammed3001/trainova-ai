// T9.M — client-safe helpers for learning paths.
//
// Mirrors `interviews-api.ts`: any caller from a `'use client'` component
// must go through this module so the request is forwarded via the
// `/api/proxy/[...path]` catch-all and the auth cookie is attached
// server-side. Server components should import `authedFetch` directly.

export type LearningPathLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type LearningStepKind = 'ARTICLE' | 'LINK' | 'VIDEO' | 'REFLECTION';

export interface CompleteNextResponse {
  completedStepId: string;
  isPathCompleted: boolean;
  certificate: { serial: string; issuedAt: string } | null;
}

async function proxy<T>(
  path: string,
  init: RequestInit & { method?: string } = {},
): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function enrollInPath(slug: string) {
  return proxy<{ id: string }>(`/learning-paths/${slug}/enroll`, {
    method: 'POST',
    body: '{}',
  });
}

export function completeNextStep(slug: string, reflection?: string) {
  return proxy<CompleteNextResponse>(`/learning-paths/${slug}/complete-next`, {
    method: 'POST',
    body: JSON.stringify(reflection ? { reflection } : {}),
  });
}
