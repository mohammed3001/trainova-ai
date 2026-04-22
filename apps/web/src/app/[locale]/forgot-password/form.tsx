'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { forgotPasswordAction } from '@/lib/auth-actions';

type ForgotState = null | { sent?: true; error?: string };

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<ForgotState, FormData>(
    forgotPasswordAction,
    null,
  );

  if (state?.sent) {
    return (
      <div className="mt-6 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
        {t('auth.forgotPasswordSent')}
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label className="label" htmlFor="email">
          {t('auth.emailLabel')}
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      {state?.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? t('common.loading') : t('auth.forgotPasswordCta')}
      </button>
    </form>
  );
}
