'use server';

import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/authed-fetch';

export interface FraudActionResult {
  ok: boolean;
  error?: string;
}

const PATH = '/[locale]/admin/fraud';

export async function reviewApplicationAction(
  applicationId: string,
  note: string,
): Promise<FraudActionResult> {
  try {
    const trimmed = note.trim();
    await authedFetch(`/admin/fraud/applications/${applicationId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: trimmed.length ? trimmed : null }),
    });
    revalidatePath(PATH, 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}

export async function clearReviewAction(
  applicationId: string,
): Promise<FraudActionResult> {
  try {
    await authedFetch(`/admin/fraud/applications/${applicationId}/review`, {
      method: 'DELETE',
    });
    revalidatePath(PATH, 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}

export async function rescoreApplicationAction(
  applicationId: string,
): Promise<FraudActionResult> {
  try {
    await authedFetch(`/admin/fraud/applications/${applicationId}/rescore`, {
      method: 'POST',
    });
    revalidatePath(PATH, 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}
