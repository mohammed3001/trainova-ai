'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Props {
  disputeId: string;
}

export function DisputeWithdrawButton({ disputeId }: Props) {
  const t = useTranslations('disputes.detail');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (busy) return;
    if (!window.confirm(t('withdrawConfirm'))) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/proxy/disputes/${encodeURIComponent(disputeId)}/withdraw`,
        { method: 'PATCH', credentials: 'same-origin' },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? tCommon('error'));
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={withdraw} disabled={busy || pending} className="btn-ghost text-rose-600">
        {t('withdraw')}
      </button>
      {error ? (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
