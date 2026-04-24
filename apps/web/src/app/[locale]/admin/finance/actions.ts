'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import type {
  AdminCancelSubscriptionInput,
  AdminPlanInput,
  AdminPlanUpdateInput,
  AdminRefundMilestoneInput,
  PlanAudience,
} from '@trainova/shared';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function readString(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
}

function readNumber(fd: FormData, name: string): number {
  const v = fd.get(name);
  if (typeof v !== 'string' || v.trim() === '') return NaN;
  return Number(v);
}

export async function refundMilestoneAction(
  contractId: string,
  milestoneId: string,
  fd: FormData,
): Promise<ActionResult> {
  const reason = readString(fd, 'reason').trim();
  if (reason.length < 3) {
    return { ok: false, error: 'Reason is required (≥ 3 characters)' };
  }
  const input: AdminRefundMilestoneInput = { reason };
  try {
    await authedFetch(`/admin/finance/milestones/${milestoneId}/refund`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath(`/[locale]/admin/finance/contracts/${contractId}`, 'page');
  revalidatePath('/[locale]/admin/finance/contracts', 'page');
  revalidatePath('/[locale]/admin/finance', 'page');
  return { ok: true };
}

export async function retryPayoutAction(payoutId: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/finance/payouts/${payoutId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/finance/payouts', 'page');
  revalidatePath('/[locale]/admin/finance', 'page');
  return { ok: true };
}

export async function cancelPayoutAction(payoutId: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/finance/payouts/${payoutId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/finance/payouts', 'page');
  return { ok: true };
}

export async function cancelSubscriptionAction(
  subscriptionId: string,
  fd: FormData,
): Promise<ActionResult> {
  const input: AdminCancelSubscriptionInput = {
    reason: readString(fd, 'reason') || undefined,
    immediate: fd.get('immediate') === 'on' || fd.get('immediate') === 'true',
  };
  try {
    await authedFetch(`/admin/finance/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/finance/subscriptions', 'page');
  revalidatePath('/[locale]/admin/finance', 'page');
  return { ok: true };
}

function parsePlanFeaturesJson(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('featuresJson must be valid JSON');
  }
}

export async function createPlanAction(fd: FormData): Promise<ActionResult> {
  let input: AdminPlanInput;
  try {
    input = {
      audience: readString(fd, 'audience') as PlanAudience,
      tier: readString(fd, 'tier'),
      priceMonthly: Math.round(readNumber(fd, 'priceMonthly')),
      priceYearly: Math.round(readNumber(fd, 'priceYearly')),
      featuresJson: parsePlanFeaturesJson(readString(fd, 'featuresJson')),
      stripePriceId: readString(fd, 'stripePriceId') || undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid input' };
  }
  try {
    await authedFetch('/admin/finance/plans', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/finance/plans', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/finance/plans`);
}

export async function updatePlanAction(id: string, fd: FormData): Promise<ActionResult> {
  let input: AdminPlanUpdateInput;
  try {
    input = {
      audience: readString(fd, 'audience') as PlanAudience,
      tier: readString(fd, 'tier'),
      priceMonthly: Math.round(readNumber(fd, 'priceMonthly')),
      priceYearly: Math.round(readNumber(fd, 'priceYearly')),
      featuresJson: parsePlanFeaturesJson(readString(fd, 'featuresJson')),
      stripePriceId: readString(fd, 'stripePriceId') || undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid input' };
  }
  try {
    await authedFetch(`/admin/finance/plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/finance/plans', 'page');
  return { ok: true };
}

export async function deletePlanAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/finance/plans/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/finance/plans', 'page');
  return { ok: true };
}
