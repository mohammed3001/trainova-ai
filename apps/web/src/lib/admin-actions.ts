'use server';

import { revalidatePath } from 'next/cache';
import { getToken } from './session';
import { apiFetch } from './api';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  return apiFetch<T>(path, { ...init, token });
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const role = String(formData.get('role') ?? '');
  await call(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  revalidatePath(`/[locale]/admin/users/${id}`, 'page');
  revalidatePath(`/[locale]/admin/users`, 'page');
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  await call(`/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath(`/[locale]/admin/users/${id}`, 'page');
  revalidatePath(`/[locale]/admin/users`, 'page');
}

async function simpleUserActionPost(
  id: string,
  endpoint: 'mark-email-verified' | 'resend-verify' | 'trigger-password-reset',
): Promise<void> {
  await call(`/admin/users/${id}/${endpoint}`, { method: 'POST' });
  revalidatePath(`/[locale]/admin/users/${id}`, 'page');
}

export async function markEmailVerifiedAction(formData: FormData): Promise<void> {
  await simpleUserActionPost(String(formData.get('id') ?? ''), 'mark-email-verified');
}

export async function resendVerifyEmailAction(formData: FormData): Promise<void> {
  await simpleUserActionPost(String(formData.get('id') ?? ''), 'resend-verify');
}

export async function triggerPasswordResetAction(formData: FormData): Promise<void> {
  await simpleUserActionPost(String(formData.get('id') ?? ''), 'trigger-password-reset');
}

export async function setCompanyVerifiedAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const verified = String(formData.get('verified') ?? 'false') === 'true';
  await call(`/admin/companies/${id}/verified`, {
    method: 'PATCH',
    body: JSON.stringify({ verified }),
  });
  revalidatePath(`/[locale]/admin/companies/${id}`, 'page');
  revalidatePath(`/[locale]/admin/companies`, 'page');
}

export async function setTrainerVerifiedAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const verified = String(formData.get('verified') ?? 'false') === 'true';
  await call(`/admin/trainers/${id}/verified`, {
    method: 'PATCH',
    body: JSON.stringify({ verified }),
  });
  revalidatePath(`/[locale]/admin/trainers/${id}`, 'page');
  revalidatePath(`/[locale]/admin/trainers`, 'page');
}

export async function reviewVerificationAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const rejectionReason = String(formData.get('rejectionReason') ?? '').trim() || undefined;
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    throw new Error('Invalid decision');
  }
  await call(`/admin/verification/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, rejectionReason }),
  });
  revalidatePath(`/[locale]/admin/verification/${id}`, 'page');
  revalidatePath(`/[locale]/admin/verification`, 'page');
}

// ---------------------------------------------------------------------------
// T5.B — requests / conversations / messages / reports
// ---------------------------------------------------------------------------

const REQUEST_STATUSES = new Set(['DRAFT', 'OPEN', 'IN_REVIEW', 'CLOSED', 'ARCHIVED']);

export async function setRequestStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || undefined;
  if (!REQUEST_STATUSES.has(status)) throw new Error('Invalid request status');
  await call(`/admin/requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
  revalidatePath(`/[locale]/admin/requests/${id}`, 'page');
  revalidatePath(`/[locale]/admin/requests`, 'page');
}

export async function setRequestFeaturedAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const featured = String(formData.get('featured') ?? 'false') === 'true';
  await call(`/admin/requests/${id}/featured`, {
    method: 'PATCH',
    body: JSON.stringify({ featured }),
  });
  revalidatePath(`/[locale]/admin/requests/${id}`, 'page');
  revalidatePath(`/[locale]/admin/requests`, 'page');
}

export async function setConversationLockedAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const locked = String(formData.get('locked') ?? 'false') === 'true';
  const reason = String(formData.get('reason') ?? '').trim() || undefined;
  await call(`/admin/conversations/${id}/lock`, {
    method: 'POST',
    body: JSON.stringify({ locked, reason }),
  });
  revalidatePath(`/[locale]/admin/conversations/${id}`, 'page');
  revalidatePath(`/[locale]/admin/conversations`, 'page');
}

export async function redactMessageAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const conversationId = String(formData.get('conversationId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) throw new Error('Reason is required');
  await call(`/admin/messages/${id}/redact`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  if (conversationId) {
    revalidatePath(`/[locale]/admin/conversations/${conversationId}`, 'page');
  }
}

const REPORT_STATUSES = new Set(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']);
const REPORT_RESOLUTIONS = new Set([
  'NO_ACTION',
  'WARNING_ISSUED',
  'CONTENT_REMOVED',
  'USER_SUSPENDED',
  'USER_BANNED',
  'ESCALATED',
]);

export async function reviewReportAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const resolutionRaw = String(formData.get('resolution') ?? '').trim();
  const resolverNotes = String(formData.get('resolverNotes') ?? '').trim() || undefined;
  if (!REPORT_STATUSES.has(status)) throw new Error('Invalid report status');
  const resolution = resolutionRaw || undefined;
  if (resolution != null && !REPORT_RESOLUTIONS.has(resolution)) {
    throw new Error('Invalid resolution');
  }
  if ((status === 'RESOLVED' || status === 'DISMISSED') && !resolution) {
    throw new Error('Resolution is required when closing a report');
  }
  await call(`/admin/reports/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, resolution, resolverNotes }),
  });
  revalidatePath(`/[locale]/admin/reports/${id}`, 'page');
  revalidatePath(`/[locale]/admin/reports`, 'page');
}
