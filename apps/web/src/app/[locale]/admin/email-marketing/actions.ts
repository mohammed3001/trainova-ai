'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import type {
  CreateEmailCampaignInput,
  CreateEmailDripSequenceInput,
  CreateEmailDripStepInput,
  ListDripEnrollmentsQuery,
  UpdateEmailCampaignInput,
  UpdateEmailDripSequenceInput,
  UpdateEmailDripStepInput,
  EmailSegment,
} from '@trainova/shared';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function s(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

function arr(fd: FormData, name: string): string[] {
  return fd
    .getAll(name)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function buildSegmentFromForm(fd: FormData): EmailSegment {
  const segment: EmailSegment = { onlyVerified: true };
  const roles = arr(fd, 'segment.roles');
  if (roles.length) segment.roles = roles as EmailSegment['roles'];
  const statuses = arr(fd, 'segment.statuses');
  if (statuses.length) segment.statuses = statuses as EmailSegment['statuses'];
  const locales = arr(fd, 'segment.locales');
  if (locales.length) segment.locales = locales as EmailSegment['locales'];
  segment.onlyVerified = fd.get('segment.onlyVerified') !== 'false';
  const after = s(fd, 'segment.createdAfter');
  if (after) segment.createdAfter = new Date(after).toISOString();
  const before = s(fd, 'segment.createdBefore');
  if (before) segment.createdBefore = new Date(before).toISOString();
  return segment;
}

// =====================
// Campaigns
// =====================

export async function createCampaignAction(fd: FormData): Promise<ActionResult> {
  const scheduledForRaw = s(fd, 'scheduledFor');
  const input: CreateEmailCampaignInput = {
    name: s(fd, 'name'),
    locale: (s(fd, 'locale') || 'en') as CreateEmailCampaignInput['locale'],
    subject: s(fd, 'subject'),
    bodyHtml: s(fd, 'bodyHtml'),
    bodyText: s(fd, 'bodyText'),
    segment: buildSegmentFromForm(fd),
    scheduledFor: scheduledForRaw ? new Date(scheduledForRaw).toISOString() : undefined,
  };
  try {
    await authedFetch('/admin/email/campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/email-marketing/campaigns', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/email-marketing/campaigns`);
}

export async function updateCampaignAction(id: string, fd: FormData): Promise<ActionResult> {
  const input: UpdateEmailCampaignInput = {
    name: s(fd, 'name') || undefined,
    locale: (s(fd, 'locale') || undefined) as UpdateEmailCampaignInput['locale'],
    subject: s(fd, 'subject') || undefined,
    bodyHtml: s(fd, 'bodyHtml') || undefined,
    bodyText: s(fd, 'bodyText') || undefined,
    segment: buildSegmentFromForm(fd),
  };
  try {
    await authedFetch(`/admin/email/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/campaigns/${id}`, 'page');
  revalidatePath('/[locale]/admin/email-marketing/campaigns', 'page');
  return { ok: true };
}

export async function scheduleCampaignAction(
  id: string,
  scheduledFor: string,
): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email/campaigns/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledFor: new Date(scheduledFor).toISOString() }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/campaigns/${id}`, 'page');
  revalidatePath('/[locale]/admin/email-marketing/campaigns', 'page');
  return { ok: true };
}

export async function cancelCampaignAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email/campaigns/${id}/cancel`, { method: 'POST' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/campaigns/${id}`, 'page');
  revalidatePath('/[locale]/admin/email-marketing/campaigns', 'page');
  return { ok: true };
}

export async function sendCampaignNowAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email/campaigns/${id}/send-now`, { method: 'POST' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/campaigns/${id}`, 'page');
  revalidatePath('/[locale]/admin/email-marketing/campaigns', 'page');
  return { ok: true };
}

export async function deleteCampaignAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email/campaigns/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/email-marketing/campaigns', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/email-marketing/campaigns`);
}

export async function previewSegmentAction(segment: EmailSegment): Promise<{
  count: number;
  sample: { id: string; name: string; email: string; role: string; locale: string }[];
}> {
  const qs = new URLSearchParams({ segment: JSON.stringify(segment) });
  return authedFetch(`/admin/email/campaigns/segment-preview?${qs}`);
}

// =====================
// Drip sequences
// =====================

export async function createDripSequenceAction(fd: FormData): Promise<ActionResult> {
  const input: CreateEmailDripSequenceInput = {
    name: s(fd, 'name'),
    slug: s(fd, 'slug'),
    trigger: (s(fd, 'trigger') || 'MANUAL') as CreateEmailDripSequenceInput['trigger'],
    enabled: fd.get('enabled') !== 'false',
  };
  try {
    await authedFetch('/admin/email/drip', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/email-marketing/drip', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/email-marketing/drip`);
}

export async function updateDripSequenceAction(
  id: string,
  fd: FormData,
): Promise<ActionResult> {
  const input: UpdateEmailDripSequenceInput = {
    name: s(fd, 'name') || undefined,
    slug: s(fd, 'slug') || undefined,
    trigger: (s(fd, 'trigger') || undefined) as UpdateEmailDripSequenceInput['trigger'],
    enabled: fd.get('enabled') !== null ? fd.get('enabled') !== 'false' : undefined,
  };
  try {
    await authedFetch(`/admin/email/drip/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/drip/${id}`, 'page');
  return { ok: true };
}

export async function deleteDripSequenceAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email/drip/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/email-marketing/drip', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/email-marketing/drip`);
}

export async function addDripStepAction(sequenceId: string, fd: FormData): Promise<ActionResult> {
  const input: CreateEmailDripStepInput = {
    delayMinutes: Number(s(fd, 'delayMinutes') || '0'),
    locale: (s(fd, 'locale') || 'en') as CreateEmailDripStepInput['locale'],
    subject: s(fd, 'subject'),
    bodyHtml: s(fd, 'bodyHtml'),
    bodyText: s(fd, 'bodyText'),
  };
  try {
    await authedFetch(`/admin/email/drip/${sequenceId}/steps`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/drip/${sequenceId}`, 'page');
  return { ok: true };
}

export async function updateDripStepAction(
  sequenceId: string,
  stepId: string,
  fd: FormData,
): Promise<ActionResult> {
  const input: UpdateEmailDripStepInput = {
    delayMinutes: fd.get('delayMinutes') !== null ? Number(s(fd, 'delayMinutes')) : undefined,
    locale: (s(fd, 'locale') || undefined) as UpdateEmailDripStepInput['locale'],
    subject: s(fd, 'subject') || undefined,
    bodyHtml: s(fd, 'bodyHtml') || undefined,
    bodyText: s(fd, 'bodyText') || undefined,
  };
  try {
    await authedFetch(`/admin/email/drip/${sequenceId}/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/drip/${sequenceId}`, 'page');
  return { ok: true };
}

export async function deleteDripStepAction(
  sequenceId: string,
  stepId: string,
): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email/drip/${sequenceId}/steps/${stepId}`, { method: 'DELETE' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/drip/${sequenceId}`, 'page');
  return { ok: true };
}

export async function enrollUserAction(sequenceId: string, fd: FormData): Promise<ActionResult> {
  const userId = s(fd, 'userId');
  if (!userId) return { ok: false, error: 'userId is required' };
  try {
    await authedFetch('/admin/email/drip/enroll', {
      method: 'POST',
      body: JSON.stringify({ sequenceId, userId }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/email-marketing/drip/${sequenceId}`, 'page');
  return { ok: true };
}

export async function cancelEnrollmentAction(enrollmentId: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email/drip/enrollments/${enrollmentId}/cancel`, { method: 'POST' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  return { ok: true };
}

interface EnrollmentRow {
  id: string;
  currentStepIdx: number;
  nextRunAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  sequence: { id: string; name: string; slug: string };
}

export async function fetchEnrollmentsAction(input: {
  sequenceId?: string;
  state?: ListDripEnrollmentsQuery['state'];
  page?: number;
  pageSize?: number;
}): Promise<{ items: EnrollmentRow[]; total: number; page: number; pageSize: number }> {
  const qs = new URLSearchParams();
  if (input.sequenceId) qs.set('sequenceId', input.sequenceId);
  if (input.state) qs.set('state', input.state);
  if (input.page) qs.set('page', String(input.page));
  if (input.pageSize) qs.set('pageSize', String(input.pageSize));
  return authedFetch(`/admin/email/drip/enrollments?${qs}`);
}
