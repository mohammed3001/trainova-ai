'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface TestOption {
  id: string;
  title: string;
}

export function AssignTestButton({
  applicationId,
  requestId,
}: {
  applicationId: string;
  requestId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [loadingTests, setLoadingTests] = useState(false);
  const [open, setOpen] = useState(false);
  const [tests, setTests] = useState<TestOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const pending = submitting || refreshing;

  async function openPopover() {
    setOpen(true);
    setError(null);
    if (tests !== null) return;
    setLoadingTests(true);
    try {
      const res = await fetch(`/api/proxy/tests?requestId=${requestId}`);
      if (!res.ok) {
        setError(t('company.tests.errors.generic'));
        setTests([]);
        return;
      }
      const data = (await res.json()) as TestOption[];
      setTests(data);
    } catch {
      setError(t('company.tests.errors.generic'));
      setTests([]);
    } finally {
      setLoadingTests(false);
    }
  }

  async function assign(testId: string) {
    if (submitting) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proxy/applications/${applicationId}/assign-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body?.message ?? t('company.tests.errors.generic'));
        return;
      }
      setOpen(false);
      setSuccess(t('company.tests.assign.success'));
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  if (open) {
    return (
      <div className="w-full space-y-2 rounded-md border border-slate-200 bg-white p-3">
        <div className="text-sm font-medium text-slate-800">
          {t('company.tests.assign.popover.title')}
        </div>
        {loadingTests ? (
          <div className="text-xs text-slate-500">{t('common.loading')}</div>
        ) : tests && tests.length === 0 ? (
          <div className="text-xs text-slate-500">
            {t('company.tests.assign.popover.empty')}
          </div>
        ) : (
          <ul className="space-y-1">
            {(tests ?? []).map((test) => (
              <li key={test.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700">{test.title}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => assign(test.id)}
                  className="rounded-md border border-brand-600 bg-brand-600 px-3 py-0.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                  data-testid={`assign-test-${test.id}`}
                >
                  {pending ? t('common.loading') : t('company.tests.assign.pickButton')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <div className="rounded bg-rose-50 p-2 text-xs text-rose-700">{error}</div>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={openPopover}
        className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
        data-testid={`assign-test-open-${applicationId}`}
      >
        {t('company.tests.assign.button')}
      </button>
      {success ? (
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
          {success}
        </span>
      ) : null}
    </div>
  );
}
