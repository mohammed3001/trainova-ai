'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { CONTACT_TOPICS } from '@trainova/shared';
import { submitContactAction, type ContactState } from './actions';

export function ContactForm({ locale }: { locale: string }) {
  const t = useTranslations('marketing.contact');
  const [state, action, pending] = useActionState<ContactState, FormData>(
    submitContactAction,
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
      {/* Honeypot — hidden from real users, often filled by bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website-hp">Website</label>
        <input
          id="contact-website-hp"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact-name">
            {t('form.name')}
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="contact-email">
            {t('form.email')}
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            className="input"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact-topic">
            {t('form.topic')}
          </label>
          <select id="contact-topic" name="topic" defaultValue="GENERAL" className="input">
            {CONTACT_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {t(`topics.${topic}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="contact-company">
            {t('form.company')}
          </label>
          <input
            id="contact-company"
            name="company"
            type="text"
            maxLength={160}
            autoComplete="organization"
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="contact-message">
          {t('form.message')}
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={20}
          maxLength={4000}
          rows={6}
          className="input"
        />
        <p className="mt-1 text-xs text-slate-500">{t('form.messageHelp')}</p>
      </div>

      {state?.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full disabled:opacity-60 sm:w-auto"
      >
        {pending ? t('form.submitting') : t('form.submit')}
      </button>
    </form>
  );
}
