'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DisputeReasons, type DisputeReason } from '@trainova/shared';

interface Props {
  contractId: string;
  locale: string;
  onCancelHref: string;
}

/**
 * Dispute raise form. Evidence is captured as one-link-per-line newline
 * input — uploads ride on the existing attachments pipeline (T1.E) and
 * are not introduced here so we don't entangle dispute raising with
 * file infra. Links are validated against `raiseDisputeInputSchema` on
 * the server (URL-shape, max 10).
 */
export function DisputeForm({ contractId, locale, onCancelHref }: Props) {
  const t = useTranslations('disputes.raise');
  const router = useRouter();
  const [reason, setReason] = useState<DisputeReason>('PAYMENT_NOT_RELEASED');
  const [description, setDescription] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const links = evidenceText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const res = await fetch('/api/proxy/disputes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          reason,
          description: description.trim(),
          ...(links.length ? { evidence: { links } } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string; statusCode?: number } | null;
        if (res.status === 409) {
          setError(t('errorActiveExists'));
        } else {
          setError(body?.message ?? t('errorGeneric'));
        }
        return;
      }
      const created = (await res.json().catch(() => null)) as { id?: string } | null;
      startTransition(() => {
        if (created?.id) router.push(`/${locale}/disputes/${created.id}`);
        else router.push(`/${locale}/disputes`);
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="card space-y-4"
      data-testid="dispute-form"
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('intro')}</p>

      <div className="space-y-1">
        <label htmlFor="dispute-reason" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('reasonLabel')}
        </label>
        <select
          id="dispute-reason"
          className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value as DisputeReason)}
        >
          {DisputeReasons.map((r) => (
            <option key={r} value={r}>
              {t(`reasons.${r}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="dispute-description" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('descriptionLabel')}
        </label>
        <textarea
          id="dispute-description"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="dispute-evidence" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('evidenceLabel')}
        </label>
        <textarea
          id="dispute-evidence"
          rows={3}
          placeholder={t('evidencePlaceholder')}
          value={evidenceText}
          onChange={(e) => setEvidenceText(e.currentTarget.value)}
          className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-mono shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          dir="ltr"
        />
      </div>

      {error ? (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert" data-testid="dispute-form-error">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <a href={onCancelHref} className="btn-ghost">
          {t('cancel')}
        </a>
        <button type="submit" disabled={busy || pending} className="btn-primary">
          {t('submit')}
        </button>
      </div>
    </form>
  );
}
