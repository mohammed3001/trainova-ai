'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Milestone {
  title: string;
  description: string;
  amount: string; // display as dollars/cents text; we convert on submit
}

interface Props {
  locale: string;
  applicationId: string;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;

export function NewContractForm({ locale, applicationId }: Props) {
  const t = useTranslations('contracts');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('USD');
  const [platformFeePct, setPlatformFeePct] = useState(10);
  const [milestones, setMilestones] = useState<Milestone[]>([
    { title: '', description: '', amount: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency }),
    [locale, currency],
  );

  const totalCents = useMemo(
    () =>
      milestones.reduce((sum, m) => {
        const n = Number(m.amount);
        if (!Number.isFinite(n) || n <= 0) return sum;
        return sum + Math.round(n * 100);
      }, 0),
    [milestones],
  );

  function updateMilestone(idx: number, patch: Partial<Milestone>) {
    setMilestones((rows) =>
      rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  }

  function addMilestone() {
    if (milestones.length >= 20) return;
    setMilestones((rows) => [...rows, { title: '', description: '', amount: '' }]);
  }

  function removeMilestone(idx: number) {
    if (milestones.length <= 1) return;
    setMilestones((rows) => rows.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || title.trim().length < 4) {
      setError(t('errors.titleRequired'));
      return;
    }
    const normalized = milestones.map((m) => {
      const n = Number(m.amount);
      const cents = Number.isFinite(n) ? Math.round(n * 100) : 0;
      return { title: m.title.trim(), description: m.description.trim(), cents };
    });
    if (normalized.some((m) => m.title.length < 2)) {
      setError(t('errors.milestoneTitleRequired'));
      return;
    }
    if (normalized.some((m) => m.cents < 100)) {
      setError(t('errors.milestoneMinAmount'));
      return;
    }
    const res = await fetch('/api/proxy/contracts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId,
        title: title.trim(),
        description: description.trim() || undefined,
        currency,
        platformFeeBps: Math.round(platformFeePct * 100),
        milestones: normalized.map((m) => ({
          title: m.title,
          description: m.description || undefined,
          amountCents: m.cents,
        })),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      try {
        const body = JSON.parse(text) as { message?: string };
        setError(body.message ?? t('errors.createFailed'));
      } catch {
        setError(t('errors.createFailed'));
      }
      return;
    }
    const body = (await res.json()) as { id: string };
    startTransition(() => router.push(`/${locale}/company/contracts/${body.id}`));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
            {t('fields.title')}
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={4}
            maxLength={200}
            className="form-input w-full"
            placeholder={t('placeholders.title')}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
            {t('fields.description')}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={10000}
            className="form-input w-full"
            placeholder={t('placeholders.description')}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
              {t('fields.currency')}
            </span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])}
              className="form-input w-full"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
              {t('fields.platformFee')}
            </span>
            <div className="relative">
              <input
                type="number"
                value={platformFeePct}
                onChange={(e) => setPlatformFeePct(Number(e.target.value))}
                min={0}
                max={50}
                step={0.1}
                className="form-input w-full pe-8"
              />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-slate-500">
                %
              </span>
            </div>
          </label>
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('milestonesTitle')}
          </h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {t('totalLabel')}: {fmt.format(totalCents / 100)}
          </span>
        </div>
        <ol className="space-y-3">
          {milestones.map((m, idx) => (
            <li
              key={idx}
              className="rounded-2xl border border-white/50 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                      {t('milestoneFields.title')}
                    </span>
                    <input
                      type="text"
                      value={m.title}
                      onChange={(e) => updateMilestone(idx, { title: e.target.value })}
                      required
                      className="form-input w-full"
                      placeholder={t('placeholders.milestoneTitle')}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                      {t('milestoneFields.description')}
                    </span>
                    <textarea
                      value={m.description}
                      onChange={(e) =>
                        updateMilestone(idx, { description: e.target.value })
                      }
                      rows={2}
                      className="form-input w-full"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                      {t('milestoneFields.amount')} ({currency})
                    </span>
                    <input
                      type="number"
                      value={m.amount}
                      onChange={(e) => updateMilestone(idx, { amount: e.target.value })}
                      min="1"
                      step="0.01"
                      required
                      className="form-input w-full"
                      placeholder="e.g. 500.00"
                    />
                  </label>
                </div>
                {milestones.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeMilestone(idx)}
                    className="btn-ghost text-rose-600 hover:text-rose-700"
                    aria-label={t('milestoneFields.remove')}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={addMilestone}
          disabled={milestones.length >= 20}
          className="btn-secondary"
        >
          + {t('milestoneFields.add')}
        </button>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-rose-300/60 bg-rose-50/70 px-4 py-3 text-sm text-rose-800 backdrop-blur dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={isPending} className="btn-primary">
          {t('createCta')}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-ghost"
          disabled={isPending}
        >
          {tCommon('cancel')}
        </button>
      </div>
    </form>
  );
}
