'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function DeleteTestButton({ testId }: { testId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = submitting || refreshing;

  async function onDelete() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proxy/tests/${testId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        if (body?.code === 'TEST_HAS_ATTEMPTS') {
          setError(t('company.tests.errors.hasAttempts'));
        } else {
          setError(body?.message ?? t('company.tests.errors.generic'));
        }
        return;
      }
      setConfirming(false);
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600">{t('company.tests.confirmDelete')}</span>
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
          data-testid={`test-delete-confirm-${testId}`}
        >
          {pending ? t('common.loading') : t('company.tests.confirmDeleteYes')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
        {error ? (
          <span className="w-full rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</span>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
      data-testid={`test-delete-${testId}`}
    >
      {t('company.tests.delete')}
    </button>
  );
}
