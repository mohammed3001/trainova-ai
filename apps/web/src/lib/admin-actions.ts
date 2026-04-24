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
