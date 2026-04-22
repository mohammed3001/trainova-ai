'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { resetPasswordAction } from '@/lib/auth-actions';

type ResetState = null | { done?: true; error?: string };

export function ResetPasswordForm({ token, locale }: { token: string; locale: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    null,
  );

  if (state?.done) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          {t('auth.resetPasswordDone')}
        </div>
        <Link href={`/${locale}/login`} className="btn-primary inline-flex w-full justify-center">
          {t('auth.loginCta')}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          {t('auth.newPasswordLabel')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </div>
      {state?.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? t('common.loading') : t('auth.resetPasswordCta')}
      </button>
    </form>
  );
}
