'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { refundMilestoneAction } from '../../actions';

interface Props {
  contractId: string;
  milestoneId: string;
  amountLabel: string;
}

export function RefundMilestoneForm({ contractId, milestoneId, amountLabel }: Props) {
  const t = useTranslations();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          const confirmMsg = t('admin.finance.contracts.refundConfirm', { amount: amountLabel });
          if (!window.confirm(confirmMsg)) return;
          fd.set('reason', reason);
          const res = await refundMilestoneAction(contractId, milestoneId, fd);
          if (!res.ok) setError(res.error ?? 'Failed');
        })
      }
      className="flex flex-wrap items-end gap-2"
    >
      <div className="flex-1 min-w-[240px]">
        <label className="block text-xs font-medium text-slate-700" htmlFor={`reason-${milestoneId}`}>
          {t('admin.finance.contracts.refundReason')}
        </label>
        <input
          id={`reason-${milestoneId}`}
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={1000}
          placeholder={t('admin.finance.contracts.refundReasonPlaceholder')}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
        />
      </div>
      <button
        type="submit"
        disabled={pending || reason.trim().length < 3}
        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? '…' : t('admin.finance.contracts.refundButton')}
      </button>
      {error ? (
        <p className="w-full text-xs text-rose-700">{error}</p>
      ) : null}
    </form>
  );
}
