'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { PayoutStatus } from '@trainova/shared';
import { cancelPayoutAction, retryPayoutAction } from '../actions';

interface Props {
  payoutId: string;
  status: PayoutStatus;
}

export function PayoutActions({ payoutId, status }: Props) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canRetry = status === 'FAILED' || status === 'CANCELLED';
  const canCancel = status === 'PENDING' || status === 'FAILED';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canRetry ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t('admin.finance.payouts.retryConfirm'))) return;
            startTransition(async () => {
              setError(null);
              const r = await retryPayoutAction(payoutId);
              if (!r.ok) setError(r.error ?? 'Failed');
            });
          }}
          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? '…' : t('admin.finance.payouts.retry')}
        </button>
      ) : null}
      {canCancel ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t('admin.finance.payouts.cancelConfirm'))) return;
            startTransition(async () => {
              setError(null);
              const r = await cancelPayoutAction(payoutId);
              if (!r.ok) setError(r.error ?? 'Failed');
            });
          }}
          className="rounded-lg bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 backdrop-blur-md hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('admin.finance.payouts.cancel')}
        </button>
      ) : null}
      {error ? <span className="text-[11px] text-rose-700">{error}</span> : null}
    </div>
  );
}
