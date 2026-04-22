'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { loginAction } from '@/lib/auth-actions';

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(loginAction, null as null | { error?: string });

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label className="label" htmlFor="email">
          {t('auth.emailLabel')}
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          {t('auth.passwordLabel')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          className="input"
        />
      </div>
      {state?.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? t('common.loading') : t('auth.loginCta')}
      </button>
      <div className="text-center text-sm">
        <a
          href={`/${locale}/forgot-password`}
          className="font-medium text-brand-700 hover:underline"
        >
          {t('auth.forgotPasswordLink')}
        </a>
      </div>
    </form>
  );
}
