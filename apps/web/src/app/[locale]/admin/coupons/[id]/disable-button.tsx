'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { disableCouponAction } from '../actions';

export function DisableCouponButton({ id }: { id: string }) {
  const t = useTranslations('admin.coupons');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(t('disableConfirm'))) return;
    startTransition(async () => {
      const res = await disableCouponAction(id);
      if (!res.ok) setError(res.error ?? 'Failed');
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      >
        {isPending ? t('disabling') : t('disable')}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </>
  );
}
