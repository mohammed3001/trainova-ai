// T8.C — Interview scheduling client-safe API helpers.
//
// Lives in its own module (separate from `chat-api.ts`) for the same
// reason as `chat-ai-api.ts` (PR #59): `chat-api.ts` imports
// `authedFetch`, which calls `next/headers` and therefore cannot be
// part of the browser bundle. Any call originating from a `'use client'`
// component must go through this module, which forwards the request via
// the existing `/api/proxy/[...path]` catch-all so the auth cookie and
// trusted client IP are attached server-side.

import type { InterviewMeetingDto, InterviewStatus } from '@trainova/shared';

export type { InterviewMeetingDto, InterviewStatus };

export interface CreateInterviewBody {
  conversationId: string;
  applicationId?: string;
  scheduledAt: string;
  durationMin?: number;
  timezone: string;
  meetingUrl?: string;
  agenda?: string;
  notes?: string;
}

export interface RescheduleInterviewBody {
  scheduledAt: string;
  durationMin?: number;
  timezone?: string;
  meetingUrl?: string | null;
  agenda?: string | null;
  notes?: string | null;
  reason?: string;
}

export interface ListInterviewsResponse {
  total: number;
  items: InterviewMeetingDto[];
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`/api/proxy${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (parsed && typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // non-JSON body — leave the raw text in `message`.
    }
    const err: Error & { status?: number } = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const createInterview = (body: CreateInterviewBody) =>
  request<InterviewMeetingDto>('POST', '/interviews', body);

export const listInterviews = (
  params: {
    conversationId?: string;
    status?: InterviewStatus;
    upcomingOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {},
) => {
  const search = new URLSearchParams();
  if (params.conversationId) search.set('conversationId', params.conversationId);
  if (params.status) search.set('status', params.status);
  if (params.upcomingOnly) search.set('upcomingOnly', 'true');
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  const qs = search.toString();
  return request<ListInterviewsResponse>('GET', `/interviews${qs ? `?${qs}` : ''}`);
};

export const cancelInterview = (id: string, reason?: string) =>
  request<InterviewMeetingDto>('POST', `/interviews/${id}/cancel`, { reason });

export const rescheduleInterview = (id: string, body: RescheduleInterviewBody) =>
  request<InterviewMeetingDto>('PATCH', `/interviews/${id}/reschedule`, body);

export const completeInterview = (id: string, notes?: string) =>
  request<InterviewMeetingDto>('POST', `/interviews/${id}/complete`, { notes });
