'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { submitAdvertiseAction, type ContactState } from '../contact/actions';

const PACKAGES = [
  'FEATURED_COMPANY',
  'SPONSORED_TRAINER',
  'CATEGORY_SPONSOR',
  'NEWSLETTER',
  'CUSTOM',
] as const;

export function AdvertiseForm({
  locale,
  defaultPackage,
}: {
  locale: string;
  defaultPackage?: (typeof PACKAGES)[number];
}) {
  const t = useTranslations('marketing.advertise');
  const [state, action, pending] = useActionState<ContactState, FormData>(
    submitAdvertiseAction,
    null,
  );

  if (state?.done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        <h2 className="text-base font-semibold text-emerald-900">{t('success.title')}</h2>
        <p className="mt-2">{t('success.body')}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="locale" value={locale} />
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="adv-website-hp">Website</label>
        <input
          id="adv-website-hp"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="adv-name">
            {t('form.name')}
          </label>
          <input id="adv-name" name="name" type="text" required minLength={2} maxLength={120} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="adv-email">
            {t('form.email')}
          </label>
          <input id="adv-email" name="email" type="email" required maxLength={254} className="input" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="adv-company">
            {t('form.company')}
          </label>
          <input id="adv-company" name="company" type="text" required minLength={2} maxLength={160} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="adv-budget">
            {t('form.budget')}
          </label>
          <input id="adv-budget" name="budgetUsd" type="number" min={0} max={10_000_000} className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="adv-package">
          {t('form.package')}
        </label>
        <select
          id="adv-package"
          name="packageId"
          defaultValue={defaultPackage ?? 'CUSTOM'}
          className="input"
        >
          {PACKAGES.map((p) => (
            <option key={p} value={p}>
              {t(`packages.${p}.title`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="adv-message">
          {t('form.message')}
        </label>
        <textarea
          id="adv-message"
          name="message"
          required
          minLength={20}
          maxLength={4000}
          rows={6}
          className="input"
        />
      </div>

      {state?.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60 sm:w-auto">
        {pending ? t('form.submitting') : t('form.submit')}
      </button>
    </form>
  );
}
