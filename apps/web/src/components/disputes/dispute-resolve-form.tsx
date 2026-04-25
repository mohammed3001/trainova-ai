'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  DISPUTE_TRANSITIONS,
  type DisputeAdminTransition,
  type DisputeStatus,
} from '@trainova/shared';

interface Props {
  disputeId: string;
  currentStatus: DisputeStatus;
}

const ADMIN_TRANSITIONS: DisputeAdminTransition[] = [
  'UNDER_REVIEW',
  'RESOLVED_FOR_TRAINER',
  'RESOLVED_FOR_COMPANY',
  'REJECTED',
];

/**
 * Admin-only resolution panel. We filter the available transitions by the
 * shared DISPUTE_TRANSITIONS table so the UI never offers a move the API
 * would reject (e.g. UNDER_REVIEW → UNDER_REVIEW).
 */
export function DisputeResolveForm({ disputeId, currentStatus }: Props) {
  const t = useTranslations('disputes.admin.resolve');
  const router = useRouter();
  const allowed = useMemo(
    () =>
      ADMIN_TRANSITIONS.filter((s) =>
        DISPUTE_TRANSITIONS[currentStatus].includes(s),
      ),
    [currentStatus],
  );
  const [status, setStatus] = useState<DisputeAdminTransition>(allowed[0] ?? 'UNDER_REVIEW');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (allowed.length === 0) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const res = await fetch(
      `/api/proxy/admin/disputes/${encodeURIComponent(disputeId)}`,
      {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
        }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? t('errorGeneric'));
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="dispute-resolve-form">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t('title')}
      </h3>
      <div className="space-y-1">
        <label htmlFor="resolve-status" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('statusLabel')}
        </label>
        <select
          id="resolve-status"
          value={status}
          onChange={(e) => setStatus(e.currentTarget.value as DisputeAdminTransition)}
          className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
        >
          {allowed.map((s) => (
            <option key={s} value={s}>
              {t(`statusOptions.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="resolve-note" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('resolutionLabel')}
        </label>
        <textarea
          id="resolve-note"
          rows={4}
          maxLength={4000}
          placeholder={t('resolutionPlaceholder')}
          value={resolution}
          onChange={(e) => setResolution(e.currentTarget.value)}
          className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
        />
      </div>
      {error ? (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {t('submit')}
        </button>
      </div>
    </form>
  );
}
