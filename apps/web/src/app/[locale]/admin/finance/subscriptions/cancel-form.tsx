'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { cancelSubscriptionAction } from '../actions';

interface Props {
  subscriptionId: string;
}

export function CancelSubscriptionForm({ subscriptionId }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [immediate, setImmediate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
      >
        {t('admin.finance.subscriptions.cancel')}
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          if (!window.confirm(t('admin.finance.subscriptions.cancelConfirm'))) return;
          fd.set('reason', reason);
          if (immediate) fd.set('immediate', 'on');
          const r = await cancelSubscriptionAction(subscriptionId, fd);
          if (!r.ok) setError(r.error ?? 'Failed');
          else setOpen(false);
        })
      }
      className="flex flex-wrap items-end gap-2"
    >
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('admin.finance.subscriptions.reasonPlaceholder')}
        maxLength={1000}
        className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-400"
      />
      <label className="inline-flex items-center gap-1 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={immediate}
          onChange={(e) => setImmediate(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        {t('admin.finance.subscriptions.immediate')}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? '…' : t('admin.finance.subscriptions.confirm')}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-white"
      >
        {t('admin.finance.subscriptions.dismiss')}
      </button>
      {error ? <span className="w-full text-[11px] text-rose-700">{error}</span> : null}
    </form>
  );
}
