'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { registerAction } from '@/lib/auth-actions';

export function RegisterForm({
  locale,
  defaultRole,
}: {
  locale: string;
  defaultRole: 'COMPANY_OWNER' | 'TRAINER';
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(registerAction, null as null | { error?: string });

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label className="label" htmlFor="name">
          {t('auth.nameLabel')}
        </label>
        <input id="name" name="name" required maxLength={120} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="email">
          {t('auth.emailLabel')}
        </label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          {t('auth.passwordLabel')}
        </label>
        <input id="password" name="password" type="password" minLength={8} required className="input" />
      </div>
      <div>
        <span className="label">{t('auth.roleLabel')}</span>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
            <input type="radio" name="role" value="COMPANY_OWNER" defaultChecked={defaultRole === 'COMPANY_OWNER'} />
            {t('auth.roleCompany')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
            <input type="radio" name="role" value="TRAINER" defaultChecked={defaultRole === 'TRAINER'} />
            {t('auth.roleTrainer')}
          </label>
        </div>
      </div>
      {state?.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? t('common.loading') : t('auth.registerCta')}
      </button>
    </form>
  );
}
