'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { PreferencesResponse } from '@trainova/shared';

interface Props {
  initial: PreferencesResponse;
  locales: ReadonlyArray<string>;
  currencies: ReadonlyArray<string>;
}

/**
 * T6.A — Display preferences form. Posting back to /users/me/preferences
 * persists to the row; the cookie-based locale rewrite happens via
 * router.refresh() after a successful save so the entire shell rerenders
 * in the freshly chosen locale without a full reload.
 */
export function PreferencesForm({ initial, locales, currencies }: Props) {
  const t = useTranslations('preferences');
  const router = useRouter();
  const [locale, setLocale] = useState(initial.locale);
  const [timezone, setTimezone] = useState(initial.timezone ?? '');
  const [currency, setCurrency] = useState(initial.currencyPreference ?? '');
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const tz = timezone.trim();
      const cc = currency.trim();
      const res = await fetch('/api/proxy/users/me/preferences', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          timezone: tz === '' ? null : tz,
          currencyPreference: cc === '' ? null : cc,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? t('errorGeneric'));
        return;
      }
      setSaved(true);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40"
      data-testid="preferences-form"
    >
      <div className="grid gap-5">
        <div className="space-y-1.5">
          <label htmlFor="pref-locale" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('localeLabel')}
          </label>
          <select
            id="pref-locale"
            value={locale}
            onChange={(e) => setLocale(e.currentTarget.value)}
            className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {t(`localeOptions.${l}` as `localeOptions.${'en' | 'ar' | 'fr' | 'es'}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pref-tz" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('timezoneLabel')}
          </label>
          <input
            id="pref-tz"
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.currentTarget.value)}
            placeholder={t('timezonePlaceholder')}
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('timezoneHint')}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pref-currency" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('currencyLabel')}
          </label>
          <select
            id="pref-currency"
            value={currency}
            onChange={(e) => setCurrency(e.currentTarget.value)}
            className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          >
            <option value="">{t('systemDefault')}</option>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {t('currencyOptionFormat', {
                  code,
                  name: t(`currencyNames.${code}` as `currencyNames.${string}`),
                })}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('currencyHint')}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            {t('saved')}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || pending}
            className="btn-primary"
          >
            {busy || pending ? t('saving') : t('submit')}
          </button>
        </div>
      </div>
    </form>
  );
}
