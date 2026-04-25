'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { SignatureRole } from '@trainova/shared';

interface Props {
  locale: string;
  contractId: string;
  documentId: string;
  role: SignatureRole;
}

export function SignDocumentClient({ locale, contractId, documentId, role }: Props) {
  const t = useTranslations('contractDocs');
  const router = useRouter();
  const [signedName, setSignedName] = useState('');
  const [intent, setIntent] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/proxy/contract-documents/${encodeURIComponent(documentId)}/sign`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName: signedName.trim(), intent: intent.trim() }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(text || t('errors.generic'));
      return;
    }
    router.refresh();
  }

  async function decline(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!window.confirm(t('detail.confirmDecline'))) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/proxy/contract-documents/${encodeURIComponent(documentId)}/decline`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(text || t('errors.generic'));
      return;
    }
    router.push(`/${locale}/contracts/${contractId}/documents`);
    router.refresh();
  }

  if (declineMode) {
    return (
      <form
        onSubmit={decline}
        className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-rose-800">
          {t('detail.declineTitle')}
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('detail.declineReason')}</span>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            maxLength={2000}
            className="rounded-lg border-rose-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:ring-rose-500"
          />
        </label>
        {error && (
          <div role="alert" className="text-xs text-rose-700">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeclineMode(false)}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('detail.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {t('detail.declineSubmit')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={sign}
      className="space-y-4 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/50 to-white p-5 shadow-sm"
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          {t('detail.signAs', { role: t(`role.${role}` as 'role.COMPANY') })}
        </h2>
        <p className="text-xs text-slate-600">{t('detail.signSubtitle')}</p>
      </div>
      {error && (
        <div role="alert" className="text-xs text-rose-700">
          {error}
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">{t('detail.signedName')}</span>
        <input
          value={signedName}
          onChange={(e) => setSignedName(e.target.value)}
          required
          minLength={2}
          maxLength={160}
          autoComplete="name"
          className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
        />
        <span className="text-xs text-slate-500">{t('detail.signedNameHint')}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">{t('detail.intent')}</span>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          required
          minLength={10}
          maxLength={2000}
          rows={2}
          className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
        />
        <span className="text-xs text-slate-500">{t('detail.intentHint')}</span>
      </label>
      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span>{t('detail.agree')}</span>
      </label>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={() => setDeclineMode(true)}
          disabled={busy}
          className="text-xs font-medium text-rose-600 hover:text-rose-700"
        >
          {t('detail.declineLink')}
        </button>
        <button
          type="submit"
          disabled={busy || !agreed}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-brand-500/30 transition hover:from-brand-700 hover:to-brand-600 disabled:opacity-50"
        >
          {t('detail.signSubmit')}
        </button>
      </div>
    </form>
  );
}
