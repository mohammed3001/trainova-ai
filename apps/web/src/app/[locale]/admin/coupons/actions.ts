'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import type {
  CreateCouponInput,
  PublicCoupon,
  UpdateCouponInput,
} from '@trainova/shared';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function readString(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

function readOptionalString(fd: FormData, name: string): string | null {
  const s = readString(fd, name);
  return s.length ? s : null;
}

function readOptionalInt(fd: FormData, name: string): number | null {
  const s = readString(fd, name);
  if (!s.length) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function readPositiveInt(fd: FormData, name: string, fallback: number): number {
  const n = readOptionalInt(fd, name);
  return n != null && n > 0 ? n : fallback;
}

function readOptionalDateTime(fd: FormData, name: string): string | null {
  const s = readString(fd, name);
  if (!s.length) return null;
  // <input type="datetime-local"> returns YYYY-MM-DDTHH:mm — convert to ISO.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function readPlanIds(fd: FormData): string[] {
  return fd
    .getAll('planIds')
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export async function createCouponAction(fd: FormData): Promise<ActionResult> {
  const kind = readString(fd, 'kind') as 'PERCENT' | 'FIXED';
  const amountOff = readPositiveInt(fd, 'amountOff', 0);
  if (amountOff <= 0) {
    return { ok: false, error: 'amountOff must be a positive integer' };
  }

  const input: CreateCouponInput = {
    code: readString(fd, 'code').toUpperCase(),
    description: readOptionalString(fd, 'description'),
    kind,
    amountOff,
    currency: readOptionalString(fd, 'currency'),
    audience: (readString(fd, 'audience') || 'ANY') as CreateCouponInput['audience'],
    appliesTo: (readString(fd, 'appliesTo') || 'ANY') as CreateCouponInput['appliesTo'],
    planIds: readPlanIds(fd),
    minAmountMinor: readOptionalInt(fd, 'minAmountMinor'),
    maxDiscountMinor: readOptionalInt(fd, 'maxDiscountMinor'),
    validFrom: readOptionalDateTime(fd, 'validFrom'),
    validUntil: readOptionalDateTime(fd, 'validUntil'),
    maxRedemptions: readOptionalInt(fd, 'maxRedemptions'),
    perUserLimit: readPositiveInt(fd, 'perUserLimit', 1),
    stripeCouponId: readOptionalString(fd, 'stripeCouponId'),
  };

  try {
    await authedFetch<PublicCoupon>('/admin/coupons', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  revalidatePath('/[locale]/admin/coupons', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/coupons`);
}

export async function updateCouponAction(id: string, fd: FormData): Promise<ActionResult> {
  const input: UpdateCouponInput = {
    description: readOptionalString(fd, 'description'),
    audience: (readString(fd, 'audience') || undefined) as UpdateCouponInput['audience'],
    appliesTo: (readString(fd, 'appliesTo') || undefined) as UpdateCouponInput['appliesTo'],
    planIds: readPlanIds(fd),
    minAmountMinor: readOptionalInt(fd, 'minAmountMinor'),
    maxDiscountMinor: readOptionalInt(fd, 'maxDiscountMinor'),
    validFrom: readOptionalDateTime(fd, 'validFrom'),
    validUntil: readOptionalDateTime(fd, 'validUntil'),
    maxRedemptions: readOptionalInt(fd, 'maxRedemptions'),
    perUserLimit: readPositiveInt(fd, 'perUserLimit', 1),
    status: (readString(fd, 'status') || undefined) as UpdateCouponInput['status'],
    stripeCouponId: readOptionalString(fd, 'stripeCouponId'),
  };

  try {
    await authedFetch<PublicCoupon>(`/admin/coupons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  revalidatePath(`/[locale]/admin/coupons/${id}`, 'page');
  revalidatePath('/[locale]/admin/coupons', 'page');
  return { ok: true };
}

export async function disableCouponAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/coupons/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/coupons', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/coupons`);
}

export async function previewCouponAction(input: {
  code: string;
  scope: 'SUBSCRIPTION' | 'MILESTONE';
  amountMinor: number;
  currency: string;
  planId?: string;
}): Promise<{ ok: true; preview: import('@trainova/shared').CouponPreviewResult } | { ok: false; error: string }> {
  try {
    const preview = await authedFetch<import('@trainova/shared').CouponPreviewResult>(
      '/coupons/preview',
      {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
